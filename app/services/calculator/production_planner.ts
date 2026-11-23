import { HIDDEN_VERBS } from '#models/recipe'
import type RecipeGraph from '#services/calculator/recipe_graph'
import type { GraphRecipe, Producer } from '#services/calculator/recipe_graph'

/**
 * What the user asked: items to make, recipe choices and what they already have.
 * The same state drives the quick calculator (query string) and saved plans.
 */
export interface CalculatorState {
  targets: { itemId: number; quantity: number }[]
  /** Buildings to build: construction recipes (a Loom, a Kiln...) */
  buildings?: { recipeId: number; quantity: number }[]
  /** itemId -> recipe to use, or 'raw' to stop expanding there */
  choices: Record<number, number | 'raw'>
  /** itemId -> quantity already owned, as typed (0 means "ignore the inventory") */
  owned: Record<number, number>
  /**
   * "Usar inventário do grupo". The planner itself ignores it: callers merge
   * the inventory into `owned` first (see inventory_owned.ts).
   */
  useInventory?: boolean
}

export type NodeReason = 'raw' | 'gathered' | 'no_recipe' | 'owned' | 'cycle' | 'depth'

export interface PlanNode {
  itemId: number
  needed: number
  fromOwned: number
  missing: number
  /** Recipe used to make the missing quantity; null when the node is a leaf */
  recipeId: number | null
  /** Recipes that can make this item, the default one first */
  alternatives: number[]
  /** The stored choice for this item, if any */
  choice: number | 'raw' | null
  crafts: number
  /** Quantities below this node are expected values (random outputs) */
  approximate: boolean
  reason: NodeReason | null
  children: PlanNode[]
}

/** A raw material of the plan, owned or not ("Coletar") */
export interface PlanMaterial {
  itemId: number
  needed: number
  /** Covered by what they have */
  owned: number
  missing: number
  approximate: boolean
  /**
   * How much of it already went into products they have (the wood in their
   * Rough Planks): nothing to gather for that part. Not in `needed`.
   */
  covered: number
  /** Those products */
  coveredBy: number[]
}

/**
 * One item to make, summed over every place the tree needs it ("Etapas").
 * `done`: they already have all of it (quantity is then what the plan takes,
 * no crafts): it still shows, in the round of the step that uses it.
 */
export interface PlanStep {
  itemId: number
  recipeId: number
  /** How many to make (done: how many the plan takes from what they have) */
  quantity: number
  crafts: number
  /** Crafts whose inputs they already have */
  readyCrafts: number
  approximate: boolean
  done: boolean
  /** 1 when only raw materials and owned items go in; else after the steps it needs */
  round: number
  /** Inputs still missing: made in an earlier step (crafted) or gathered */
  waitingOn: { itemId: number; missing: number; crafted: boolean }[]
}

/** A building to build: the last round of the steps */
export interface PlanBuild {
  /** The construction recipe */
  recipeId: number
  quantity: number
  /** Everything it takes is in hand */
  ready: boolean
  waitingOn: { itemId: number; missing: number; crafted: boolean }[]
  /** What it takes, expanded like any target */
  children: PlanNode[]
}

export interface PlanResult {
  trees: PlanNode[]
  builds: PlanBuild[]
  rawMaterials: { itemId: number; quantity: number; approximate: boolean }[]
  /** Every raw material, the incomplete ones first */
  materials: PlanMaterial[]
  /** The crafts in the order they can be done */
  steps: PlanStep[]
  effortBySkill: { skill: string; actions: number }[]
  warnings: string[]
}

interface StepTotal extends Omit<PlanStep, 'round' | 'waitingOn'> {
  /** Steps that make its inputs */
  needs: Set<number>
  /** Done steps: the items whose steps use it */
  usedBy: Set<number>
  waiting: Map<number, { missing: number; crafted: boolean }>
}

const MAX_DEPTH = 30
const NOT_BY_DEFAULT = new Set([...HIDDEN_VERBS, 'Identify'])
const EPSILON = 1e-9

/**
 * Recipes that can make an item, minus the ones that consume the item itself
 * (recrafts, reforges): those can never lower what you need.
 */
export function producersOf(graph: RecipeGraph, itemId: number): Producer[] {
  return (graph.producers.get(itemId) ?? []).filter((producer) => {
    const recipe = graph.recipes.get(producer.recipeId)
    return recipe && !recipe.inputs.some((input) => input.itemId === itemId)
  })
}

/**
 * The recipe used when the user made no choice: no scrap/recraft/unpack and
 * friends, then visible before hidden, none that takes an animal no hunt
 * leaves (see RecipeGraph.isLostAnimal), fixed output before random, lowest
 * skill level, lowest id.
 */
export function defaultProducer(graph: RecipeGraph, itemId: number): Producer | undefined {
  const takesLostAnimal = (recipe: GraphRecipe) =>
    recipe.inputs.some((input) => graph.isLostAnimal(input.itemId))
  return producersOf(graph, itemId)
    .filter((p) => !NOT_BY_DEFAULT.has(graph.recipes.get(p.recipeId)!.verb))
    .sort((a, b) => {
      const ra = graph.recipes.get(a.recipeId)!
      const rb = graph.recipes.get(b.recipeId)!
      return (
        Number(ra.hidden) - Number(rb.hidden) ||
        Number(takesLostAnimal(ra)) - Number(takesLostAnimal(rb)) ||
        Number(b.deterministic) - Number(a.deterministic) ||
        (ra.skillLevel ?? 0) - (rb.skillLevel ?? 0) ||
        ra.id - rb.id
      )
    })[0]
}

export function plan(graph: RecipeGraph, state: CalculatorState): PlanResult {
  const warnings: string[] = []
  const pool = new Map<number, number>(
    Object.entries(state.owned).map(([itemId, quantity]) => [Number(itemId), quantity])
  )
  const raw = new Map<number, { quantity: number; approximate: boolean }>()
  const materials = new Map<number, PlanMaterial>()
  const steps = new Map<number, StepTotal>()
  const effort = new Map<string, number>()
  const nameOf = (itemId: number) => graph.items.get(itemId)?.name ?? `#${itemId}`

  const materialOf = (itemId: number) => {
    const total = materials.get(itemId) ?? {
      itemId,
      needed: 0,
      owned: 0,
      missing: 0,
      approximate: false,
      covered: 0,
      coveredBy: [],
    }
    materials.set(itemId, total)
    return total
  }

  const addMaterial = (node: PlanNode) => {
    const total = materialOf(node.itemId)
    total.needed += node.needed
    total.owned += node.fromOwned
    total.missing += node.missing
    total.approximate ||= node.approximate
  }

  /**
   * A product they already have, taken apart down to its raw materials, as
   * "Coletar" shows them: covered, nothing to gather. Same recipes as the
   * plan; the pool is not touched.
   */
  const cover = (
    itemId: number,
    quantity: number,
    path: Set<number>,
    approximate: boolean,
    product: number
  ) => {
    const producer = path.has(itemId) || path.size >= MAX_DEPTH ? undefined : chosenProducer(itemId)
    if (!producer) {
      const total = materialOf(itemId)
      total.covered += quantity
      total.approximate ||= approximate
      if (!total.coveredBy.includes(product)) total.coveredBy.push(product)
      return
    }
    const recipe = graph.recipes.get(producer.recipeId)!
    const crafts = producer.deterministic
      ? Math.ceil(quantity / producer.yield - EPSILON)
      : quantity / producer.yield
    const childPath = new Set(path).add(itemId)
    for (const input of recipe.inputs) {
      cover(
        input.itemId,
        input.quantity * crafts,
        childPath,
        approximate || !producer.deterministic,
        product
      )
    }
  }

  const newStep = (itemId: number, recipeId: number, done: boolean): StepTotal => ({
    itemId,
    recipeId,
    quantity: 0,
    crafts: 0,
    readyCrafts: 0,
    approximate: false,
    done,
    needs: new Set<number>(),
    usedBy: new Set<number>(),
    waiting: new Map(),
  })

  /** An item they already have all of: a done step, unless it is also made somewhere */
  const addOwned = (node: PlanNode, parentId: number | null) => {
    const current = steps.get(node.itemId)
    if (current && !current.done) return
    const producer = chosenProducer(node.itemId)
    if (!producer) return
    const step = current ?? newStep(node.itemId, producer.recipeId, true)
    step.quantity += node.needed
    step.approximate ||= node.approximate
    if (parentId !== null) step.usedBy.add(parentId)
    steps.set(node.itemId, step)
  }

  const addStep = (node: PlanNode) => {
    // Made here: it replaces a done step of the same item (what they have is used elsewhere)
    const current = steps.get(node.itemId)
    const step = current && !current.done ? current : newStep(node.itemId, node.recipeId!, false)
    step.quantity += node.missing
    step.crafts += node.crafts
    step.approximate ||= node.approximate
    // The share of the inputs they have limits the crafts: 4 of 10 trunks, 4 of 10 splits
    const covered = Math.min(
      1,
      ...node.children.map((child) => (child.needed > 0 ? child.fromOwned / child.needed : 1))
    )
    const ready = node.crafts * covered
    // Whole crafts for a fixed output; random outputs count in expected values
    step.readyCrafts += Number.isInteger(node.crafts) ? Math.floor(ready + EPSILON) : ready
    for (const child of node.children) {
      const crafted = child.recipeId !== null
      if (crafted) step.needs.add(child.itemId)
      if (child.missing <= EPSILON) continue
      const waiting = step.waiting.get(child.itemId) ?? { missing: 0, crafted }
      waiting.missing += child.missing
      waiting.crafted ||= crafted
      step.waiting.set(child.itemId, waiting)
    }
    steps.set(node.itemId, step)
  }

  // The same item twice in the list is one target
  const targets = new Map<number, number>()
  for (const target of state.targets) {
    targets.set(target.itemId, (targets.get(target.itemId) ?? 0) + target.quantity)
  }

  /**
   * How an item is obtained: the recipe chosen for it; without a choice,
   * gathered when the world gives it as it is (sand, braxite, logs: no need
   * to make it), else the default recipe. A choice that no longer makes the
   * item counts as none, with a warning.
   */
  const pickProducer = (
    itemId: number,
    warn = true
  ): { producer?: Producer; raw: boolean; gathered?: boolean } => {
    const choice = state.choices[itemId]
    if (choice === 'raw') return { raw: true }
    if (choice !== undefined) {
      const chosen = producersOf(graph, itemId).find((p) => p.recipeId === choice)
      if (chosen) return { producer: chosen, raw: false }
      if (warn) {
        warnings.push(
          `A receita escolhida para ${nameOf(itemId)} não existe mais ou não produz esse item; usando a padrão.`
        )
      }
    }
    if (graph.gatheredDirectly.has(itemId)) return { raw: true, gathered: true }
    return { producer: defaultProducer(graph, itemId), raw: false }
  }

  /** The recipe that makes an item, or none: a raw material (gathered, bought, chosen as raw) */
  const chosenProducer = (itemId: number) => {
    const picked = pickProducer(itemId, false)
    return picked.raw ? undefined : picked.producer
  }

  const expand = (
    itemId: number,
    needed: number,
    path: Set<number>,
    approximate: boolean,
    parentId: number | null
  ): PlanNode => {
    const available = pool.get(itemId) ?? 0
    const fromOwned = Math.min(available, needed)
    if (fromOwned > 0) pool.set(itemId, available - fromOwned)
    const missing = needed - fromOwned

    const alternatives = producersOf(graph, itemId).map((p) => p.recipeId)
    const node: PlanNode = {
      itemId,
      needed,
      fromOwned,
      missing,
      recipeId: null,
      alternatives,
      choice: state.choices[itemId] ?? null,
      crafts: 0,
      approximate,
      reason: null,
      children: [],
    }

    const leaf = (reason: NodeReason) => {
      node.reason = reason
      addMaterial(node)
      if (missing > EPSILON) {
        const total = raw.get(itemId) ?? { quantity: 0, approximate: false }
        total.quantity += missing
        total.approximate ||= approximate
        raw.set(itemId, total)
      }
      return node
    }

    if (missing <= EPSILON) {
      node.reason = 'owned'
      // What they have still shows, complete: a raw material in "Coletar",
      // something made in the round of the step that uses it, and what it is
      // made of in "Coletar" too
      if (chosenProducer(itemId)) {
        addOwned(node, parentId)
        cover(itemId, node.needed, path, approximate, itemId)
      } else addMaterial(node)
      return node
    }
    if (path.has(itemId)) {
      warnings.push(`${nameOf(itemId)} depende de si mesmo; tratado como matéria-prima.`)
      return leaf('cycle')
    }
    if (path.size >= MAX_DEPTH) return leaf('depth')

    const picked = pickProducer(itemId)
    if (picked.raw) return leaf(picked.gathered ? 'gathered' : 'raw')
    if (!picked.producer) return leaf('no_recipe')

    // Default recipe first, so the dropdown reads "padrão" on top
    const fallback = defaultProducer(graph, itemId)
    if (fallback) {
      node.alternatives = [
        fallback.recipeId,
        ...alternatives.filter((id) => id !== fallback.recipeId),
      ]
    }

    const { producer } = picked
    const recipe = graph.recipes.get(producer.recipeId)!
    const childApproximate = approximate || !producer.deterministic
    node.recipeId = recipe.id
    node.approximate = childApproximate
    node.crafts = producer.deterministic
      ? Math.ceil(missing / producer.yield - EPSILON)
      : missing / producer.yield

    const skill = recipe.skillName ?? '—'
    effort.set(skill, (effort.get(skill) ?? 0) + recipe.actionsRequired * node.crafts)

    const childPath = new Set(path).add(itemId)
    node.children = recipe.inputs.map((input) =>
      expand(input.itemId, input.quantity * node.crafts, childPath, childApproximate, itemId)
    )
    addStep(node)
    return node
  }

  const trees: PlanNode[] = []
  for (const [itemId, quantity] of targets) {
    const item = graph.items.get(itemId)
    if (!item) {
      warnings.push(`O item #${itemId} não existe nos dados do jogo.`)
      continue
    }
    if (item.removed) warnings.push(`${item.name} saiu do jogo; o cálculo usa os dados antigos.`)
    trees.push(expand(itemId, quantity, new Set(), false, null))
  }

  // Buildings: what each takes is expanded like a target; building them is the last step
  const buildTotals = new Map<number, number>()
  for (const b of state.buildings ?? []) {
    buildTotals.set(b.recipeId, (buildTotals.get(b.recipeId) ?? 0) + b.quantity)
  }
  const builds: PlanBuild[] = []
  for (const [recipeId, quantity] of buildTotals) {
    const recipe = graph.constructions.get(recipeId)
    if (!recipe) {
      warnings.push(`A construção #${recipeId} não existe nos dados do jogo.`)
      continue
    }
    const skill = recipe.skillName ?? '—'
    effort.set(skill, (effort.get(skill) ?? 0) + recipe.actionsRequired * quantity)
    const children = recipe.inputs.map((input) =>
      expand(input.itemId, input.quantity * quantity, new Set(), false, null)
    )
    const waiting = new Map<number, { missing: number; crafted: boolean }>()
    for (const child of children) {
      if (child.missing <= EPSILON) continue
      const entry = waiting.get(child.itemId) ?? { missing: 0, crafted: false }
      entry.missing += child.missing
      entry.crafted ||= child.recipeId !== null
      waiting.set(child.itemId, entry)
    }
    builds.push({
      recipeId,
      quantity,
      ready: waiting.size === 0,
      waitingOn: [...waiting]
        .map(([itemId, entry]) => ({ itemId, ...entry }))
        .sort((a, b) => Number(b.crafted) - Number(a.crafted) || b.missing - a.missing),
      children,
    })
  }

  return {
    trees,
    builds,
    rawMaterials: [...raw.entries()]
      .map(([itemId, total]) => ({ itemId, ...total }))
      .sort((a, b) => b.quantity - a.quantity || nameOf(a.itemId).localeCompare(nameOf(b.itemId))),
    materials: [...materials.values()].sort(
      (a, b) =>
        Number(a.missing <= EPSILON) - Number(b.missing <= EPSILON) ||
        b.missing - a.missing ||
        nameOf(a.itemId).localeCompare(nameOf(b.itemId))
    ),
    steps: orderSteps(graph, steps, nameOf),
    effortBySkill: [...effort.entries()]
      .map(([skill, actions]) => ({ skill, actions }))
      .sort((a, b) => b.actions - a.actions),
    warnings: [...new Set(warnings)],
  }
}

/**
 * The steps in an order that works: round 1 takes only raw materials and
 * owned items; each later round, the steps that need an earlier one. A done
 * step (they have it all) goes one round before the first step that uses it.
 * Inside a round, what is left to do first, then by station, so one visit to
 * a station does all of its crafts.
 */
function orderSteps(
  graph: RecipeGraph,
  steps: Map<number, StepTotal>,
  nameOf: (itemId: number) => string
): PlanStep[] {
  const rounds = new Map<number, number>()
  const visiting = new Set<number>()
  // Two trees can need each other's items (a cycle cut in each): the loop counts as 0
  const roundOf = (itemId: number): number => {
    const known = rounds.get(itemId)
    if (known !== undefined) return known
    if (visiting.has(itemId)) return 0
    visiting.add(itemId)
    let round = 1
    for (const need of steps.get(itemId)!.needs) {
      if (steps.has(need)) round = Math.max(round, roundOf(need) + 1)
    }
    visiting.delete(itemId)
    rounds.set(itemId, round)
    return round
  }

  const toDo = [...steps.values()].filter((step) => !step.done)
  const lastRound = Math.max(1, ...toDo.map((step) => roundOf(step.itemId)))
  const doneRound = (step: StepTotal) => {
    const users = [...step.usedBy].filter((id) => steps.get(id)?.done === false).map(roundOf)
    // A target they already have all of: with the finished products, at the end
    return users.length ? Math.max(1, Math.min(...users) - 1) : lastRound
  }

  const station = (step: StepTotal) => {
    const recipe = graph.recipes.get(step.recipeId)
    return `${recipe?.stationName ?? ''} ${String(recipe?.stationTier ?? 0).padStart(2, '0')}`
  }

  return [...steps.values()]
    .map((step) => ({ step, round: step.done ? doneRound(step) : roundOf(step.itemId) }))
    .sort(
      (a, b) =>
        a.round - b.round ||
        Number(a.step.done) - Number(b.step.done) ||
        station(a.step).localeCompare(station(b.step)) ||
        nameOf(a.step.itemId).localeCompare(nameOf(b.step.itemId))
    )
    .map(({ step, round }) => ({
      itemId: step.itemId,
      recipeId: step.recipeId,
      quantity: step.quantity,
      crafts: step.crafts,
      readyCrafts: step.readyCrafts,
      approximate: step.approximate,
      done: step.done,
      round,
      waitingOn: [...step.waiting]
        .map(([itemId, entry]) => ({ itemId, ...entry }))
        .sort((a, b) => Number(b.crafted) - Number(a.crafted) || b.missing - a.missing),
    }))
}
