import type RecipeGraph from '#services/calculator/recipe_graph'
import type { GraphItem, GraphRecipe } from '#services/calculator/recipe_graph'
import type { InventoryOption, OwnedSource } from '#services/calculator/inventory_owned'
import type {
  CalculatorState,
  NodeReason,
  PlanNode,
  PlanResult,
  PlanStep,
} from '#services/calculator/production_planner'
import type { ItemHolder } from '#services/inventory/stock'

const EPSILON = 1e-9
// The same format as the views' formatNumber, for labels built here
const numberFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

/** Whole crafts: random outputs give fractions, and nobody does 0,01 of a craft */
const wholeCrafts = (crafts: number) => Math.ceil(crafts - EPSILON)

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
  no_recipe: 'sem receita: coleta, drop ou loja',
  cycle: 'ciclo: tratado como matéria-prima',
  depth: 'cadeia longa demais: parou aqui',
}

const unknownItem = (id: number): GraphItem => ({
  id,
  name: `#${id}`,
  tier: 0,
  rarity: null,
  kind: 'item',
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

  const materials = result.materials.map((material) => {
    // A value typed by hand says nothing about where the items are
    const whoHas =
      sources[material.itemId] === 'manual' ? [] : (holders?.get(material.itemId) ?? [])
    return {
      ...material,
      item: item(material.itemId),
      complete: material.missing <= EPSILON,
      percent: material.needed > 0 ? Math.min(100, (material.owned / material.needed) * 100) : 100,
      holders: whoHas,
      /** "Nimbus 3 · Quartz 1" */
      holdersLabel: whoHas
        .map((holder) => `${holder.owner} ${numberFormat.format(holder.quantity)}`)
        .join(' · '),
    }
  })

  const step = (s: PlanStep) => {
    const waitingOn = s.waitingOn.map((w) => ({ ...w, item: item(w.itemId) }))
    return {
      ...s,
      item: item(s.itemId),
      recipe: graph.recipes.get(s.recipeId) ?? null,
      wholeCrafts: wholeCrafts(s.crafts),
      wholeReadyCrafts: wholeCrafts(s.readyCrafts),
      ready: s.readyCrafts >= s.crafts - EPSILON,
      waitingOn,
      /** "Sturdy Leather, 18 Hideworking Salt": a step's name, a material's quantity too */
      waitingLabel: waitingOn
        .map((w) =>
          w.crafted
            ? w.item.name
            : `${s.approximate ? '≈ ' : ''}${numberFormat.format(w.missing)} ${w.item.name}`
        )
        .join(', '),
    }
  }
  const steps = result.steps.map(step)
  const rounds: { round: number; steps: typeof steps }[] = []
  for (const s of steps) {
    const last = rounds.at(-1)
    if (last?.round === s.round) last.steps.push(s)
    else rounds.push({ round: s.round, steps: [s] })
  }

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

  return {
    targets: state.targets.map((t, index) => ({
      index,
      item: item(t.itemId),
      quantity: t.quantity,
    })),
    trees: result.trees.map(node),
    rawMaterials: result.rawMaterials.map((r) => ({ ...r, item: item(r.itemId) })),
    /** "Coletar": every raw material, with what they have of it */
    materials,
    materialsDone: materials.filter((m) => m.complete).length,
    /** "Etapas": the crafts by round */
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
