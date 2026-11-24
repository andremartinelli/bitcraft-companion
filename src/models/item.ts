import { Prisma } from '@/generated/prisma/client.ts'
import { db } from '@/lib/db'
import { escapeLike, searchWords } from '@/lib/search'
import { recipeDetails, type RecipeWithDetails } from '@/models/recipe'

/** An item found by the search (the items page and the calculator's picker) */
export interface ItemSearchResult {
  id: number
  name: string
  tier: number
  rarity: string | null
  kind: 'item' | 'cargo'
  /** Set when the item is a craft result whose rarity is drawn ("resultado do craft") */
  itemListGameId: number | null
}

/** A building (construction recipe) found by the calculator's picker */
export interface BuildingSearchResult {
  id: number
  name: string
}

/** Searches need at least 2 letters */
const MIN_QUERY = 2

const namesMatch = (column: string, words: string[]) =>
  Prisma.join(
    words.map((word) => Prisma.sql`${Prisma.raw(column)} ILIKE ${`%${escapeLike(word)}%`}`),
    ' AND '
  )

/**
 * Active items whose name has every word. Craftable items first: the same
 * name often exists as the craft result (random rarity) and as each rarity,
 * which only drops. Then the shorter name, the lower tier.
 */
export async function searchItems(q: string | undefined, limit = 20): Promise<ItemSearchResult[]> {
  const words = searchWords(q)
  if (!words.length || (q ?? '').trim().length < MIN_QUERY) return []
  const craftable = Prisma.join(['Scrap', 'Recraft', 'Unpack', 'Package'])
  return db.$queryRaw<ItemSearchResult[]>`
    SELECT i.id, i.name, i.tier, i.rarity, i.kind::text AS kind,
           i.item_list_game_id AS "itemListGameId"
    FROM items i
    WHERE i.removed_at IS NULL AND ${namesMatch('i.name', words)}
    ORDER BY EXISTS (
        SELECT 1 FROM recipe_outputs ro JOIN recipes r ON r.id = ro.recipe_id
        WHERE ro.item_id = i.id AND r.removed_at IS NULL AND r.verb NOT IN (${craftable})
      ) DESC,
      length(i.name), i.tier, i.id
    LIMIT ${limit}`
}

/** Active buildings (construction recipes) whose name has every word, shorter names first */
export async function searchBuildings(
  q: string | undefined,
  limit = 10
): Promise<BuildingSearchResult[]> {
  const words = searchWords(q)
  if (!words.length || (q ?? '').trim().length < MIN_QUERY) return []
  return db.$queryRaw<BuildingSearchResult[]>`
    SELECT r.id, r.name FROM recipes r
    WHERE r.removed_at IS NULL AND r.kind = 'construction' AND ${namesMatch('r.name', words)}
    ORDER BY length(r.name), r.id
    LIMIT ${limit}`
}

/** An item still in the game; null for one that left it (its page answers 404) */
export function findActiveItem(id: number) {
  return db.item.findFirst({ where: { id, removedAt: null } })
}

export interface ProducingRecipe {
  recipe: RecipeWithDetails
  /** Expected quantity of this item per craft */
  quantity: number
  /** Chance of getting it at all, when it comes from a random output; null when guaranteed */
  chance: number | null
}

/**
 * Recipes that yield an item, directly or inside a random output.
 */
export async function producingRecipes(itemId: number): Promise<ProducingRecipe[]> {
  const [direct, viaLists] = await Promise.all([
    db.recipeOutput.findMany({ where: { itemId }, select: { recipeId: true, quantity: true } }),
    db.$queryRaw<{ recipe_id: number; out_qty: number; probability: number; qty: number }[]>`
      SELECT ro.recipe_id, ro.quantity AS out_qty, p.probability, pi.quantity AS qty
      FROM item_list_possibility_items pi
      JOIN item_list_possibilities p ON p.id = pi.possibility_id
      JOIN item_lists l ON l.id = p.item_list_id
      JOIN items o ON o.item_list_id = l.id
      JOIN recipe_outputs ro ON ro.item_id = o.id
      WHERE pi.item_id = ${itemId} AND l.removed_at IS NULL AND o.removed_at IS NULL`,
  ])

  const byRecipe = new Map<number, { quantity: number; chance: number | null }>()
  for (const row of direct) {
    const entry = byRecipe.get(row.recipeId) ?? { quantity: 0, chance: null }
    entry.quantity += row.quantity
    byRecipe.set(row.recipeId, entry)
  }
  for (const row of viaLists) {
    const entry = byRecipe.get(row.recipe_id) ?? { quantity: 0, chance: 0 }
    entry.quantity += row.probability * row.qty * row.out_qty
    if (entry.chance !== null) entry.chance = Math.min(1, entry.chance + row.probability)
    byRecipe.set(row.recipe_id, entry)
  }
  if (byRecipe.size === 0) return []

  const recipes = await db.recipe.findMany({
    where: { id: { in: [...byRecipe.keys()] }, removedAt: null },
    include: recipeDetails,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  })
  return recipes.map((recipe) => ({ recipe, ...byRecipe.get(recipe.id)! }))
}

/**
 * Recipes that take an item as an ingredient.
 */
export function consumingRecipes(itemId: number): Promise<RecipeWithDetails[]> {
  return db.recipe.findMany({
    where: { removedAt: null, inputs: { some: { itemId } } },
    include: recipeDetails,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  })
}
