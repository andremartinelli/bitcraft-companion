import { withInventory } from '@/services/calculator/inventory_owned'
import { plan, type CalculatorState } from '@/services/calculator/production_planner'
import { present } from '@/services/calculator/presenter'
import { getRecipeGraph } from '@/services/calculator/recipe_graph'
import type { StockOwners } from '@/services/inventory/scope'

/**
 * A calculation as the page shows it: the recipe graph of the latest import,
 * "já tenho" filled from the inventory of the page's characters and claims
 * (services/inventory/scope), the plan and its presentation. The quick
 * calculator and the plans both use it.
 */
export async function calculate(state: CalculatorState, owners: StockOwners) {
  const [graph, { planState, sources, totals, holders, inventory }] = await Promise.all([
    getRecipeGraph(),
    withInventory(state, owners),
  ])
  return present(graph, state, plan(graph, planState), {
    sources,
    inventoryTotals: totals,
    holders,
    inventory,
  })
}
