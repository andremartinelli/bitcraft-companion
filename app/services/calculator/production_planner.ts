import { HIDDEN_VERBS } from '#models/recipe'
import type RecipeGraph from '#services/calculator/recipe_graph'
import type { Producer } from '#services/calculator/recipe_graph'

/**
 * What the user asked: items to make, recipe choices and what they already have.
 * The same state drives the quick calculator (query string) and saved plans.
 */
export interface CalculatorState {
  targets: { itemId: number; quantity: number }[]
  /** itemId -> recipe to use, or 'raw' to stop expanding there */
  choices: Record<number, number | 'raw'>
  /** itemId -> quantity already owned */
  owned: Record<number, number>
}

export type NodeReason = 'raw' | 'no_recipe' | 'owned' | 'cycle' | 'depth'

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

export interface PlanResult {
  trees: PlanNode[]
  rawMaterials: { itemId: number; quantity: number; approximate: boolean }[]
  effortBySkill: { skill: string; actions: number }[]
  warnings: string[]
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
 * friends, then visible before hidden, fixed output before random, lowest
 * skill level, lowest id.
 */
export function defaultProducer(graph: RecipeGraph, itemId: number): Producer | undefined {
  return producersOf(graph, itemId)
    .filter((p) => !NOT_BY_DEFAULT.has(graph.recipes.get(p.recipeId)!.verb))
    .sort((a, b) => {
      const ra = graph.recipes.get(a.recipeId)!
      const rb = graph.recipes.get(b.recipeId)!
      return (
        Number(ra.hidden) - Number(rb.hidden) ||
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
  const effort = new Map<string, number>()
  const nameOf = (itemId: number) => graph.items.get(itemId)?.name ?? `#${itemId}`

  // The same item twice in the list is one target
  const targets = new Map<number, number>()
  for (const target of state.targets) {
    targets.set(target.itemId, (targets.get(target.itemId) ?? 0) + target.quantity)
  }

  const pickProducer = (itemId: number): { producer?: Producer; raw: boolean } => {
    const choice = state.choices[itemId]
    if (choice === 'raw') return { raw: true }
    if (choice !== undefined) {
      const chosen = producersOf(graph, itemId).find((p) => p.recipeId === choice)
      if (chosen) return { producer: chosen, raw: false }
      warnings.push(
        `A receita escolhida para ${nameOf(itemId)} não existe mais ou não produz esse item; usando a padrão.`
      )
    }
    return { producer: defaultProducer(graph, itemId), raw: false }
  }

  const expand = (
    itemId: number,
    needed: number,
    path: Set<number>,
    approximate: boolean
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
      return node
    }
    if (path.has(itemId)) {
      warnings.push(`${nameOf(itemId)} depende de si mesmo; tratado como matéria-prima.`)
      return leaf('cycle')
    }
    if (path.size >= MAX_DEPTH) return leaf('depth')

    const picked = pickProducer(itemId)
    if (picked.raw) return leaf('raw')
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
      expand(input.itemId, input.quantity * node.crafts, childPath, childApproximate)
    )
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
    trees.push(expand(itemId, quantity, new Set(), false))
  }

  return {
    trees,
    rawMaterials: [...raw.entries()]
      .map(([itemId, total]) => ({ itemId, ...total }))
      .sort((a, b) => b.quantity - a.quantity || nameOf(a.itemId).localeCompare(nameOf(b.itemId))),
    effortBySkill: [...effort.entries()]
      .map(([skill, actions]) => ({ skill, actions }))
      .sort((a, b) => b.actions - a.actions),
    warnings: [...new Set(warnings)],
  }
}
