import type RecipeGraph from '#services/calculator/recipe_graph'
import type { GraphItem, GraphRecipe } from '#services/calculator/recipe_graph'
import type {
  CalculatorState,
  NodeReason,
  PlanNode,
  PlanResult,
} from '#services/calculator/production_planner'

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
  owned: number | null
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
export function present(graph: RecipeGraph, state: CalculatorState, result: PlanResult) {
  const item = (id: number) => graph.items.get(id) ?? unknownItem(id)

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
    effortBySkill: result.effortBySkill,
    warnings: result.warnings,
    choices: Object.entries(state.choices).map(([itemId, value]) => ({
      itemId,
      value: String(value),
    })),
    owned: Object.entries(state.owned).map(([itemId, quantity]) => ({ itemId, quantity })),
  }
}

export type CalculatorPanel = ReturnType<typeof present>
