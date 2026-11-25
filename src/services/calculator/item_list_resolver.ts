import { Prisma } from '@/generated/prisma/client.ts'
import { db } from '@/lib/db'
import { escapeLike, searchWords } from '@/lib/search'
import {
  levenshtein,
  parseItemList,
  type ListLine,
  type ResolvedList,
} from '@/services/calculator/item_list'
import { MAX_BUILDING_QUANTITY, MAX_QUANTITY } from '@/services/calculator/state_params'

interface Match {
  key: string
  id: number
  name: string
}

/** Suggestions only for the first unknown names: one query each */
const MAX_SUGGESTIONS = 10

/**
 * The same name is often several items: the craft result (random rarity)
 * and each rarity. As the picker's search: craftable first, then the
 * lower tier; then the lower rarity, so "Astralite Axe" is the Common craft.
 */
function findItems(keys: string[]) {
  const craftable = Prisma.join(['Scrap', 'Recraft', 'Unpack', 'Package'])
  return db.$queryRaw<Match[]>`
    SELECT DISTINCT ON (lower(i.name)) lower(i.name) AS key, i.id, i.name
    FROM items i
    WHERE i.removed_at IS NULL AND lower(i.name) = ANY(${keys})
    ORDER BY lower(i.name),
      EXISTS (
        SELECT 1 FROM recipe_outputs ro JOIN recipes r ON r.id = ro.recipe_id
        WHERE ro.item_id = i.id AND r.removed_at IS NULL AND r.verb NOT IN (${craftable})
      ) DESC,
      i.tier,
      array_position(ARRAY['Default','Common','Uncommon','Rare','Epic','Legendary','Mythic'], i.rarity),
      i.id`
}

function findBuildings(keys: string[]) {
  return db.$queryRaw<Match[]>`
    SELECT DISTINCT ON (lower(r.name)) lower(r.name) AS key, r.id, r.name
    FROM recipes r
    WHERE r.removed_at IS NULL AND r.kind = 'construction' AND lower(r.name) = ANY(${keys})
    ORDER BY lower(r.name), r.id`
}

/** The closest active name among those sharing a word, if it is close enough */
async function closestName(name: string): Promise<string | null> {
  const words = searchWords(name).filter((word) => word.length >= 3)
  if (!words.length) return null
  const any = (column: string) =>
    Prisma.join(
      words.map((word) => Prisma.sql`${Prisma.raw(column)} ILIKE ${`%${escapeLike(word)}%`}`),
      ' OR '
    )
  const candidates = await db.$queryRaw<{ name: string }[]>`
    SELECT DISTINCT name FROM (
      SELECT i.name FROM items i WHERE i.removed_at IS NULL AND (${any('i.name')})
      UNION
      SELECT r.name FROM recipes r
      WHERE r.removed_at IS NULL AND r.kind = 'construction' AND (${any('r.name')})
    ) names
    LIMIT 500`
  const wanted = name.toLowerCase()
  let best: { name: string; distance: number } | null = null
  for (const candidate of candidates) {
    const distance = levenshtein(wanted, candidate.name.toLowerCase())
    if (!best || distance < best.distance) best = { name: candidate.name, distance }
  }
  return best && best.distance <= Math.max(2, Math.floor(wanted.length / 4)) ? best.name : null
}

const label = (line: ListLine) => `${line.where}, “${line.name}”`

/**
 * A pasted list, with each name resolved to an active item or building
 * (exact, ignoring case; a building wins over an item with its name, as in
 * the picker, where buildings come first). Every problem at once; with any,
 * nothing is returned to add.
 */
export async function resolveItemList(text: string): Promise<ResolvedList> {
  const entries = parseItemList(text)
  const lines = entries.filter((entry): entry is ListLine => !('error' in entry))
  const keys = [...new Set(lines.map((line) => line.name.toLowerCase()))]
  const [items, buildings] = keys.length
    ? await Promise.all([findItems(keys), findBuildings(keys)])
    : [[], []]
  const itemByKey = new Map(items.map((match) => [match.key, match]))
  const buildingByKey = new Map(buildings.map((match) => [match.key, match]))

  const itemTotals = new Map<number, { itemId: number; name: string; quantity: number }>()
  const buildingTotals = new Map<number, { recipeId: number; name: string; quantity: number }>()
  const errors: string[] = []
  let suggestions = 0
  for (const line of entries) {
    if ('error' in line) {
      errors.push(line.error)
      continue
    }
    const key = line.name.toLowerCase()
    const building = buildingByKey.get(key)
    const item = itemByKey.get(key)
    if (building) {
      if (line.quantity > MAX_BUILDING_QUANTITY) {
        errors.push(`${label(line)}: uma construção vai de 1 a 1.000.`)
        continue
      }
      const total = buildingTotals.get(building.id)
      if (total) total.quantity += line.quantity
      else
        buildingTotals.set(building.id, {
          recipeId: building.id,
          name: building.name,
          quantity: line.quantity,
        })
    } else if (item) {
      if (line.quantity > MAX_QUANTITY) {
        errors.push(`${label(line)}: a quantidade vai de 1 a 100.000.`)
        continue
      }
      const total = itemTotals.get(item.id)
      if (total) total.quantity += line.quantity
      else itemTotals.set(item.id, { itemId: item.id, name: item.name, quantity: line.quantity })
    } else {
      const suggestion = suggestions++ < MAX_SUGGESTIONS ? await closestName(line.name) : null
      errors.push(
        `${label(line)}: não encontrado.${suggestion ? ` Quis dizer ${suggestion}?` : ''}`
      )
    }
  }

  if (errors.length) return { items: [], buildings: [], errors }
  return { items: [...itemTotals.values()], buildings: [...buildingTotals.values()], errors: [] }
}
