import type { RecipeGraph } from '@/services/calculator/recipe_graph'
import type { GraphItem, GraphRecipe } from '@/services/calculator/recipe_graph'
import type { InventoryOption, OwnedSource } from '@/services/calculator/inventory_owned'
import {
  defaultProducer,
  previousTierInput,
  producersOf,
  type CalculatorState,
  type NodeReason,
  type PlanNode,
  type PlanResult,
  type PlanStep,
} from '@/services/calculator/production_planner'
import { ANY_PROFESSION, type ItemHolder } from '@/services/inventory/professions'

const EPSILON = 1e-9
// The same format as the views' formatNumber, for labels built here
const numberFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

/** Whole crafts: random outputs give fractions, and nobody does 0,01 of a craft */
const wholeCrafts = (crafts: number) => Math.ceil(crafts - EPSILON)

/** A recipe without a skill (rare in the game data) */
const NO_SKILL = 'Sem profissão'

/** A raw material no gathering gives: bought, dropped by a creature, a quest... */
const OTHER_SOURCES = 'Outras fontes: loja, drop ou criatura'

/** A skill as a heading: "ANY" in Portuguese */
const professionName = (skill: string | null | undefined, none: string) =>
  !skill ? none : skill === 'ANY' ? ANY_PROFESSION : skill

/** Named professions first, alphabetically; then "any"; then none or other sources */
const professionRank = (name: string) =>
  name === NO_SKILL || name === OTHER_SOURCES ? 2 : name === ANY_PROFESSION ? 1 : 0

/** Splits a list by profession, keeping each one's order */
function byProfession<T>(list: T[], nameOf: (entry: T) => string) {
  const groups = new Map<string, T[]>()
  for (const entry of list) {
    const name = nameOf(entry)
    groups.set(name, [...(groups.get(name) ?? []), entry])
  }
  return [...groups]
    .sort(([a], [b]) => professionRank(a) - professionRank(b) || a.localeCompare(b))
    .map(([name, entries]) => ({ name, key: slug(name), entries }))
}

/** "Outras fontes: loja, drop ou criatura" → "outras-fontes-loja-drop-ou-criatura", for storage keys */
const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** Where "já tenho" came from, per item, and the inventory option (see withInventory) */
export interface PresentOptions {
  sources?: Record<number, OwnedSource>
  inventoryTotals?: Map<number, number> | null
  /** Who has each item, when the inventory is on */
  holders?: Map<number, ItemHolder[]> | null
  inventory?: InventoryOption
}

export interface PresentedNode {
  item: GraphItem
  needed: number
  fromOwned: number
  missing: number
  crafts: number
  approximate: boolean
  reason: NodeReason | null
  reasonLabel: string | null
  recipe: GraphRecipe | null
  /** Recipe dropdown: automatic, raw material, then each recipe */
  options: { value: string; label: string; selected: boolean }[]
  /** The value typed by hand, for the "já tenho" input */
  owned: number | null
  /** Where the quantity taken from "já tenho" came from */
  ownedSource: OwnedSource | null
  /** The group's total in the inventory, when the option is on */
  inventoryQuantity: number | null
  children: PresentedNode[]
}

const REASONS: Record<NodeReason, string> = {
  owned: 'vocês já têm',
  raw: 'tratado como matéria-prima',
  gathered: 'coletado no mundo',
  no_recipe: 'sem receita: coleta, drop ou loja',
  cycle: 'ciclo: tratado como matéria-prima',
  depth: 'cadeia longa demais: parou aqui',
}

const unknownItem = (id: number): GraphItem => ({
  id,
  name: `#${id}`,
  tier: 0,
  rarity: null,
  iconAssetName: null,
  kind: 'item',
  tag: null,
  removed: true,
})

function recipeLabel(recipe: GraphRecipe) {
  const station = recipe.stationName ? ` · ${recipe.stationName} T${recipe.stationTier}` : ''
  return `${recipe.name}${station}`
}

/**
 * Turns the planner result into what the views print: items and recipes
 * resolved, labels in Portuguese.
 */
export function present(
  graph: RecipeGraph,
  state: CalculatorState,
  result: PlanResult,
  extras: PresentOptions = {}
) {
  const item = (id: number) => graph.items.get(id) ?? unknownItem(id)
  const sources = extras.sources ?? {}
  const totals = extras.inventoryTotals ?? null
  const holders = extras.holders ?? null

  // A value typed by hand says nothing about where the items are
  const whoHas = (itemId: number) =>
    sources[itemId] === 'manual' ? [] : (holders?.get(itemId) ?? [])
  /** "Nimbus 3 · Quartz 1" */
  const holdersLabelOf = (itemId: number) =>
    whoHas(itemId)
      .map((holder) => `${holder.owner} ${numberFormat.format(holder.quantity)}`)
      .join(' · ')
  /** What they have of an item: the value typed by hand, else the inventory */
  const haveOf = (itemId: number) =>
    sources[itemId] === 'manual' ? (state.owned[itemId] ?? 0) : (totals?.get(itemId) ?? 0)

  const materials = result.materials.map((material) => {
    const approx = material.approximate ? '≈ ' : ''
    const products = material.coveredBy.map((id) => item(id).name)
    const productsLabel =
      products.length > 2
        ? `${products.slice(0, 2).join(', ')} e mais ${products.length - 2}`
        : products.join(' e ')
    const onlyCovered = material.needed <= EPSILON
    return {
      ...material,
      item: item(material.itemId),
      complete: material.missing <= EPSILON,
      /** "51 / 695"; only covered: how much went into what they have */
      qtyLabel: onlyCovered
        ? `${approx}${numberFormat.format(material.covered)}`
        : `${approx}${numberFormat.format(material.owned)} / ${numberFormat.format(material.needed)}`,
      // Where some of it is matters only when some has to be gathered
      holders: onlyCovered ? [] : whoHas(material.itemId),
      holdersLabel: onlyCovered ? '' : holdersLabelOf(material.itemId),
      /** "vocês já têm em Rough Plank"; besides a need, "90 já em Rough Plank" */
      coveredLabel: !material.covered
        ? null
        : onlyCovered
          ? `vocês já têm em ${productsLabel}`
          : `${approx}${numberFormat.format(material.covered)} já em ${productsLabel}`,
    }
  })

  /**
   * "← 45 Rough Plank + 9 Basic Wood Polish": what all the crafts of a step
   * take, pointing at the card of what they make (expected values, "≈", when
   * the output is random). `yields`: how many come out, when it is not the
   * crafts count shown beside it (a split giving 2 logs a craft).
   */
  const flowOf = (
    recipe: GraphRecipe | undefined,
    times: number,
    approximate: boolean,
    yields: string | null
  ) => {
    if (!recipe) return null
    const approx = approximate ? '≈ ' : ''
    const inputs = recipe.inputs
      .map((i) => `${approx}${numberFormat.format(i.quantity * times)} ${item(i.itemId).name}`)
      .join(' + ')
    return `← ${inputs}${yields ? ` · rende ${yields}` : ''}`
  }

  /**
   * "Trocar receita": every recipe that makes the item, the default one first,
   * when there is more than one. What goes into one craft, how many come out,
   * and where. Nothing for a done step: there is nothing to make.
   */
  const recipesOf = (s: PlanStep) => {
    const producers = producersOf(graph, s.itemId)
    if (s.done || producers.length < 2) return []
    const fallback = defaultProducer(graph, s.itemId)?.recipeId
    return producers
      .sort((a, b) => Number(b.recipeId === fallback) - Number(a.recipeId === fallback))
      .flatMap((producer) => {
        const recipe = graph.recipes.get(producer.recipeId)
        if (!recipe) return []
        const approx = producer.deterministic ? '' : '≈ '
        const where = recipe.stationName
          ? `${recipe.stationName} T${recipe.stationTier}`
          : recipe.toolName
            ? `${recipe.toolName} T${recipe.toolTier}`
            : 'sem estação'
        return [
          {
            id: recipe.id,
            name: recipe.name,
            /** "1 Basic Embergrain Plant" */
            inputsLabel:
              recipe.inputs
                .map((i) => `${numberFormat.format(i.quantity)} ${item(i.itemId).name}`)
                .join(' + ') || 'nada',
            /** "rende 3": per craft */
            yieldLabel: `rende ${approx}${numberFormat.format(producer.yield)}`,
            /** "Farming Station T1 · Nv 3 · 100 ações" */
            whereLabel: [
              where,
              recipe.skillLevel ? `Nv ${recipe.skillLevel}` : null,
              `${numberFormat.format(recipe.actionsRequired)} ações`,
            ]
              .filter(Boolean)
              .join(' · '),
            isDefault: recipe.id === fallback,
            inUse: recipe.id === s.recipeId,
          },
        ]
      })
  }

  const step = (s: PlanStep) => {
    const waitingOn = s.waitingOn.map((w) => ({ ...w, item: item(w.itemId) }))
    const recipe = graph.recipes.get(s.recipeId)
    const producer = graph.producers.get(s.itemId)?.find((p) => p.recipeId === s.recipeId)
    const made = s.crafts * (producer?.yield ?? 1)
    const approx = s.approximate ? '≈ ' : ''
    return {
      ...s,
      item: item(s.itemId),
      recipe: graph.recipes.get(s.recipeId) ?? null,
      recipes: recipesOf(s),
      wholeCrafts: wholeCrafts(s.crafts),
      wholeReadyCrafts: wholeCrafts(s.readyCrafts),
      // A done step has nothing left to make: not "ready", complete
      ready: !s.done && s.readyCrafts >= s.crafts - EPSILON,
      waitingOn,
      /** "Sturdy Leather, 18 Hideworking Salt": a step's name, a material's quantity too */
      waitingLabel: waitingOn
        .map((w) =>
          w.crafted
            ? w.item.name
            : `${s.approximate ? '≈ ' : ''}${numberFormat.format(w.missing)} ${w.item.name}`
        )
        .join(', '),
      /** What the crafts take and give; nothing for a done step */
      flowLabel: s.done
        ? null
        : flowOf(
            recipe,
            s.crafts,
            s.approximate,
            Math.abs(made - wholeCrafts(s.crafts)) > EPSILON
              ? `${approx}${numberFormat.format(made)}`
              : null
          ),
      /**
       * Done: why nothing goes into it, "vocês já têm 614 · Nimbus 600 · Quartz 14"
       * (the plan takes only part of it)
       */
      haveLabel: s.done
        ? [
            `vocês já têm ${numberFormat.format(Math.max(haveOf(s.itemId), s.quantity))}`,
            holdersLabelOf(s.itemId),
          ]
            .filter(Boolean)
            .join(' · ')
        : null,
    }
  }
  // Round 1 of the page is gathering ("Coletar"): the crafts start at round 2
  const steps = result.steps.map(step)
  type PresentedStep = (typeof steps)[number]
  /** "6 itens · 2 prontos · 3 completos": what a folded round or profession still says */
  const countLabel = (list: PresentedStep[]) => {
    const ready = list.filter((s) => s.ready).length
    const done = list.filter((s) => s.done).length
    return [
      `${list.length} ${list.length === 1 ? 'item' : 'itens'}`,
      ready ? `${ready} ${ready === 1 ? 'pronto' : 'prontos'}` : null,
      done ? `${done} ${done === 1 ? 'completo' : 'completos'}` : null,
    ]
      .filter(Boolean)
      .join(' · ')
  }

  const rounds: {
    round: number
    steps: PresentedStep[]
    countLabel: string
    /** Everything in it is done: "Esconder concluídos" hides it */
    complete: boolean
    /** The round's steps by the profession that makes them */
    professions: {
      name: string
      key: string
      entries: PresentedStep[]
      countLabel: string
      complete: boolean
    }[]
  }[] = []
  for (const s of steps) {
    const round = s.round + 1
    const last = rounds.at(-1)
    if (last?.round === round) last.steps.push(s)
    else rounds.push({ round, steps: [s], countLabel: '', complete: false, professions: [] })
  }
  for (const group of rounds) {
    group.countLabel = countLabel(group.steps)
    group.complete = group.steps.every((s) => s.done)
    group.professions = byProfession(group.steps, (s) =>
      professionName(s.recipe?.skillName, NO_SKILL)
    ).map((profession) => ({
      ...profession,
      countLabel: countLabel(profession.entries),
      complete: profession.entries.every((s) => s.done),
    }))
  }

  const materialGroups = byProfession(materials, (m) =>
    professionName(graph.gatherers.get(m.itemId), OTHER_SOURCES)
  ).map((profession) => ({
    ...profession,
    doneCount: profession.entries.filter((m) => m.complete).length,
    complete: profession.entries.every((m) => m.complete),
  }))
  const gatherComplete = materials.every((m) => m.complete)
  /** Lines they have all of, gathered or made: "Esconder concluídos" says how many */
  const doneCount = materials.filter((m) => m.complete).length + steps.filter((s) => s.done).length

  const node = (n: PlanNode): PresentedNode => {
    const choice = n.choice === null ? '' : String(n.choice)
    const options = [{ value: '', label: 'Automático', selected: choice === '' }]
    if (n.alternatives.length) {
      options.push({ value: 'raw', label: 'Tratar como matéria-prima', selected: choice === 'raw' })
      for (const recipeId of n.alternatives) {
        const recipe = graph.recipes.get(recipeId)
        if (recipe)
          options.push({
            value: String(recipeId),
            label: recipeLabel(recipe),
            selected: choice === String(recipeId),
          })
      }
    }
    return {
      item: item(n.itemId),
      needed: n.needed,
      fromOwned: n.fromOwned,
      missing: n.missing,
      crafts: n.crafts,
      approximate: n.approximate,
      reason: n.reason,
      reasonLabel: n.reason ? REASONS[n.reason] : null,
      recipe: n.recipeId ? (graph.recipes.get(n.recipeId) ?? null) : null,
      options,
      owned: state.owned[n.itemId] ?? null,
      ownedSource: sources[n.itemId] ?? (state.owned[n.itemId] !== undefined ? 'manual' : null),
      inventoryQuantity: totals ? (totals.get(n.itemId) ?? 0) : null,
      children: n.children.map(node),
    }
  }

  /** A construction recipe by id; one that left the game still shows */
  const construction = (id: number): GraphRecipe =>
    graph.constructions.get(id) ?? {
      id,
      name: `Construção #${id}`,
      verb: 'Build',
      skillName: null,
      skillLevel: null,
      stationName: null,
      stationTier: null,
      toolName: null,
      toolTier: null,
      actionsRequired: 0,
      hidden: false,
      inputs: [],
    }

  // Building comes after every craft: the round after the last one
  const buildRound = {
    round: (rounds.at(-1)?.round ?? 1) + 1,
    entries: result.builds.map((b) => {
      const waitingOn = b.waitingOn.map((w) => ({ ...w, item: item(w.itemId) }))
      const recipe = construction(b.recipeId)
      return {
        ...b,
        recipe,
        flowLabel: flowOf(recipe, b.quantity, false, null),
        waitingLabel: waitingOn
          .map((w) =>
            w.crafted ? w.item.name : `${numberFormat.format(w.missing)} ${w.item.name}`
          )
          .join(', '),
      }
    }),
  }

  return {
    targets: state.targets.map((t, index) => {
      const previous = previousTierInput(graph, state, t.itemId)
      return {
        index,
        item: item(t.itemId),
        quantity: t.quantity,
        /** The previous tier its recipe takes, and whether they marked it as theirs */
        previousTier:
          previous === null
            ? null
            : { item: item(previous), owned: (state.owned[previous] ?? 0) > 0 },
      }
    }),
    /** The buildings of the plan, as listed at the top */
    buildings: (state.buildings ?? []).map((b, index) => ({
      index,
      recipe: construction(b.recipeId),
      quantity: b.quantity,
      removed: !graph.constructions.has(b.recipeId),
    })),
    /** Nothing asked yet: no item and no building */
    empty: !state.targets.length && !(state.buildings ?? []).length,
    trees: result.trees.map(node),
    /** Each building and the tree of what it takes */
    buildTrees: result.builds.map((b) => ({
      recipe: construction(b.recipeId),
      quantity: b.quantity,
      children: b.children.map(node),
    })),
    /** "Construir": the last round, when there are buildings */
    buildRound: result.builds.length ? buildRound : null,
    rawMaterials: result.rawMaterials.map((r) => ({ ...r, item: item(r.itemId) })),
    /** "Coletar": every raw material, with what they have of it */
    materials,
    /** The same, by the profession that gathers each one in the world */
    materialGroups,
    materialsDone: materials.filter((m) => m.complete).length,
    /** Round 1 has nothing left to gather */
    gatherComplete,
    doneCount,
    /** "Etapas": the crafts by round, from round 2 (round 1 is `materials`) */
    rounds,
    warnings: result.warnings,
    choices: Object.entries(state.choices).map(([itemId, value]) => ({
      itemId,
      value: String(value),
    })),
    owned: Object.entries(state.owned).map(([itemId, quantity]) => ({ itemId, quantity })),
    /** The user's choice (the hidden field); `inventory.enabled` says whether it applies */
    useInventory: state.useInventory !== false,
    inventory: extras.inventory ?? { available: false, enabled: false, syncedAt: null },
  }
}

export type CalculatorPanel = ReturnType<typeof present>
