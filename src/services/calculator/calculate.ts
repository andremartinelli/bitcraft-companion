import { withInventory } from '@/services/calculator/inventory_owned'
import { plan, type CalculatorState } from '@/services/calculator/production_planner'
import { present } from '@/services/calculator/presenter'
import { getRecipeGraph } from '@/services/calculator/recipe_graph'

/**
 * A calculation as the page shows it: the recipe graph of the latest import,
 * "já tenho" filled from the viewing account's inventory (when on), the plan and its
 * presentation. The quick calculator and the plans both use it.
 */
export async function calculate(state: CalculatorState, userId: number) {
  const [graph, { planState, sources, totals, holders, inventory }] = await Promise.all([
    getRecipeGraph(),
    withInventory(state, userId),
  ])
  return present(graph, state, plan(graph, planState), {
    sources,
    inventoryTotals: totals,
    holders,
    inventory,
  })
}
