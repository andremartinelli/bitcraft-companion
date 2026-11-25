import { Prisma, type ContainerKind } from '@/generated/prisma/client.ts'
import { db } from '@/lib/db'
import { namesMatch, searchWords } from '@/lib/search'
import { defaultProducer, producersOf } from '@/services/calculator/production_planner'
import { getRecipeGraph, type RecipeGraph } from '@/services/calculator/recipe_graph'
import { ANY_PROFESSION, NO_PROFESSION, type ItemHolder } from '@/services/inventory/professions'

/**
 * The stock of some characters, as of the last sync (whose: services/inventory/scope).
 * The inventory page by tab, the item page's "Você tem", and what the
 * calculator uses as "já tenho".
 */

export const INVENTORY_TABS = ['professions', 'all', 'places'] as const
export type InventoryTab = (typeof INVENTORY_TABS)[number]

/** What each kind of place is called */
export const CONTAINER_KINDS: Record<ContainerKind, string> = {
  personal: 'Mochila',
  toolbelt: 'Cinto',
  wallet: 'Carteira',
  bank: 'Banco',
  stash: 'Settlement Stash',
  housing: 'Casa',
  deployable: 'Veículos e baús portáteis',
  claim: 'Baús da claim',
  other: 'Outros',
}

export interface ItemPlace {
  container: string
  owner: string
  quantity: number
}

export interface StockLine {
  item: {
    id: number
    name: string
    tier: number
    rarity: string | null
    iconAssetName: string | null
  }
  quantity: number
  /** Where it is and whose it is, the largest pile first */
  where: ItemPlace[]
}

export interface StockSection {
  /** Stable id of the section, so the page can remember it collapsed */
  key: string
  title: string
  subtitle: string | null
  lines: StockLine[]
}

interface EntryRow {
  item_id: number
  quantity: number
  container_id: number
  container_name: string
  kind: ContainerKind
  claim_name: string | null
  player_id: number | null
  username: string | null
  name: string
  tier: number
  rarity: string | null
  icon_asset_name: string | null
}

const KIND_ORDER = Object.keys(CONTAINER_KINDS)

/** Named professions first, alphabetically; then "any"; then "no recipe" */
const professionRank = (name: string) =>
  name === NO_PROFESSION ? 2 : name === ANY_PROFESSION ? 1 : 0

/** "Nimbus" for a player's container, "Claim Vila" for a shared chest */
const ownerOf = (row: { username: string | null; claim_name: string | null }) =>
  row.username ?? (row.claim_name ? `Claim ${row.claim_name}` : 'Claim')

const byLargest = (a: ItemPlace, b: ItemPlace) =>
  b.quantity - a.quantity || a.owner.localeCompare(b.owner)

/**
 * Every entry of the characters, with its place, owner and item; only items
 * whose name has every word of `q`
 */
function entries(playerIds: number[], q?: string) {
  const words = searchWords(q)
  return db.$queryRaw<EntryRow[]>`
    SELECT e.item_id, e.quantity, c.id AS container_id, c.name AS container_name,
           c.kind::text AS kind, c.claim_name, p.id AS player_id, p.username,
           i.name, i.tier, i.rarity, i.icon_asset_name
    FROM inventory_entries e
    JOIN inventory_containers c ON c.id = e.container_id
    JOIN items i ON i.id = e.item_id
    JOIN game_players p ON p.id = c.game_player_id
    WHERE p.id = ANY(${playerIds}::int[])
      AND ${words.length ? namesMatch('i.name', words) : Prisma.sql`TRUE`}`
}

function toLines(rows: EntryRow[]): StockLine[] {
  const byItem = new Map<number, { item: StockLine['item']; where: ItemPlace[] }>()
  for (const row of rows) {
    const line = byItem.get(row.item_id) ?? {
      item: {
        id: row.item_id,
        name: row.name,
        tier: row.tier,
        rarity: row.rarity,
        iconAssetName: row.icon_asset_name,
      },
      where: [],
    }
    line.where.push({ container: row.container_name, owner: ownerOf(row), quantity: row.quantity })
    byItem.set(row.item_id, line)
  }
  return [...byItem.values()]
    .map(({ item, where }) => ({
      item,
      quantity: where.reduce((sum, place) => sum + place.quantity, 0),
      where: where.sort(byLargest),
    }))
    .sort((a, b) => a.item.name.localeCompare(b.item.name) || a.item.id - b.item.id)
}

function groupBy<K>(rows: EntryRow[], key: (row: EntryRow) => K) {
  const groups = new Map<K, EntryRow[]>()
  for (const row of rows) {
    const k = key(row)
    groups.set(k, [...(groups.get(k) ?? []), row])
  }
  return groups
}

/**
 * The profession (skill) that makes an item: the one of the recipe the
 * calculator uses by default; failing that, of any recipe that makes it.
 */
function professionOf(graph: RecipeGraph, itemId: number) {
  const producer = defaultProducer(graph, itemId) ?? producersOf(graph, itemId)[0]
  if (!producer) return NO_PROFESSION
  const skill = graph.recipes.get(producer.recipeId)?.skillName
  if (!skill || skill === 'ANY') return ANY_PROFESSION
  return skill
}

/**
 * The inventory page. Tabs: by the profession that makes each item, the
 * total ("Tudo"), or each place.
 */
export async function inventoryListing(
  playerIds: number[],
  tab: InventoryTab,
  q?: string
): Promise<{ sections: StockSection[] }> {
  const rows = await entries(playerIds, q)

  if (tab === 'professions') {
    const graph = await getRecipeGraph()
    const byProfession = groupBy(rows, (row) => professionOf(graph, row.item_id))
    const sections = [...byProfession]
      .sort(([a], [b]) => professionRank(a) - professionRank(b) || a.localeCompare(b))
      .map(([profession, professionRows]) => ({
        key: `professions:${profession}`,
        title: profession,
        subtitle: null,
        lines: toLines(professionRows),
      }))
    return { sections }
  }

  if (tab === 'all') {
    return { sections: [{ key: 'all', title: 'Tudo', subtitle: null, lines: toLines(rows) }] }
  }

  const byContainer = groupBy(rows, (row) => row.container_id)
  const sections = [...byContainer.values()]
    .sort((a, b) => {
      const [ra, rb] = [a[0], b[0]]
      return (
        Number(ra.player_id === null) - Number(rb.player_id === null) ||
        ownerOf(ra).localeCompare(ownerOf(rb)) ||
        KIND_ORDER.indexOf(ra.kind) - KIND_ORDER.indexOf(rb.kind) ||
        ra.container_name.localeCompare(rb.container_name)
      )
    })
    .map((containerRows) => {
      const first = containerRows[0]
      const kindLabel = CONTAINER_KINDS[first.kind] ?? first.kind
      return {
        // Names repeat ("Mochila" of each player): the container id does not
        key: `places:${first.container_id}`,
        title: first.container_name,
        subtitle:
          first.container_name === kindLabel
            ? ownerOf(first)
            : `${ownerOf(first)} · ${kindLabel.toLowerCase()}`,
        lines: toLines(containerRows),
      }
    })
  return { sections }
}

/** The characters' total of each item: what the calculator can use as "já tenho" */
export async function stockTotals(playerIds: number[]): Promise<Map<number, number>> {
  const rows = await db.inventoryEntry.groupBy({
    by: ['itemId'],
    where: { container: { gamePlayerId: { in: playerIds } } },
    _sum: { quantity: true },
  })
  return new Map(rows.map((row) => [row.itemId, Number(row._sum.quantity ?? 0)]))
}

/** Each item's holders among the characters, the one with most first (the plan's "Coletar") */
export async function holdersByItem(playerIds: number[]): Promise<Map<number, ItemHolder[]>> {
  const rows = await db.$queryRaw<
    { item_id: number; quantity: number; username: string | null; claim_name: string | null }[]
  >`
    SELECT e.item_id, e.quantity, p.username, c.claim_name
    FROM inventory_entries e
    JOIN inventory_containers c ON c.id = e.container_id
    JOIN game_players p ON p.id = c.game_player_id
    WHERE p.id = ANY(${playerIds}::int[])`

  const byItem = new Map<number, Map<string, number>>()
  for (const row of rows) {
    const owners = byItem.get(row.item_id) ?? new Map<string, number>()
    const owner = ownerOf(row)
    owners.set(owner, (owners.get(owner) ?? 0) + Number(row.quantity))
    byItem.set(row.item_id, owners)
  }
  return new Map(
    [...byItem].map(([itemId, owners]) => [
      itemId,
      [...owners]
        .map(([owner, quantity]) => ({ owner, quantity }))
        .sort((a, b) => b.quantity - a.quantity || a.owner.localeCompare(b.owner)),
    ])
  )
}

/** Where the characters keep an item, and how many in all (the item page) */
export async function itemStock(itemId: number, playerIds: number[]) {
  const rows = await db.inventoryEntry.findMany({
    where: { itemId, container: { gamePlayerId: { in: playerIds } } },
    select: {
      quantity: true,
      container: {
        select: { name: true, claimName: true, gamePlayer: { select: { username: true } } },
      },
    },
  })
  const places: ItemPlace[] = rows
    .map(({ quantity, container }) => ({
      container: container.name,
      owner: ownerOf({
        username: container.gamePlayer?.username ?? null,
        claim_name: container.claimName,
      }),
      quantity,
    }))
    .sort(byLargest)
  return { total: places.reduce((sum, place) => sum + place.quantity, 0), places }
}
