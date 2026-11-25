import { Prisma } from '@/generated/prisma/client.ts'
import { db } from '@/lib/db'
import { producersOf, type CalculatorState } from '@/services/calculator/production_planner'
import { getRecipeGraph } from '@/services/calculator/recipe_graph'

type Client = Prisma.TransactionClient

/**
 * The recipe an account picked for an item ("Trocar receita"): its default
 * from then on. A new plan starts with them (insertPlan) and keeps its own
 * choices after that; the quick calculator uses them for the items its URL
 * chose nothing for. Decided on 25/11/2026.
 */

/** itemId -> recipeId */
export async function recipeChoicesOf(
  userId: number,
  client: Client = db
): Promise<Record<number, number>> {
  const rows = await client.userRecipeChoice.findMany({
    where: { userId },
    select: { itemId: true, recipeId: true },
  })
  return Object.fromEntries(rows.map((row) => [row.itemId, row.recipeId]))
}

/** The state with the account's recipes where it chose nothing */
export async function withRecipeChoices(
  state: CalculatorState,
  userId: number,
  client: Client = db
): Promise<CalculatorState> {
  const defaults = await recipeChoicesOf(userId, client)
  return { ...state, choices: { ...defaults, ...state.choices } }
}

/**
 * Keeps the recipe as the account's default for the item. False, saving
 * nothing, when the calculator would not use it for that item (it does not
 * make it, or left the game).
 */
export async function saveRecipeChoice(userId: number, itemId: number, recipeId: number) {
  const graph = await getRecipeGraph()
  if (!producersOf(graph, itemId).some((producer) => producer.recipeId === recipeId)) return false
  await db.userRecipeChoice.upsert({
    where: { userId_itemId: { userId, itemId } },
    create: { userId, itemId, recipeId },
    update: { recipeId },
  })
  return true
}
