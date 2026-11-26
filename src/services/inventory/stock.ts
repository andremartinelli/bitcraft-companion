import { Prisma, type ContainerKind } from '@/generated/prisma/client.ts'
import { db } from '@/lib/db'
import { namesMatch, searchWords } from '@/lib/search'
import { defaultProducer, producersOf } from '@/services/calculator/production_planner'
import { getRecipeGraph, type RecipeGraph } from '@/services/calculator/recipe_graph'
import { ANY_PROFESSION, NO_PROFESSION, type ItemHolder } from '@/services/inventory/professions'
import type { StockOwners } from '@/services/inventory/scope'

/**
 * The stock of some characters and claims, as of the last sync (whose: services/inventory/scope).
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

/** The places of these owners: the characters' own and the counted claims' chests of the counted kinds */
const ownedBy = ({ playerIds, claimIds, excludedBuildingIds = [] }: StockOwners) => ({
  OR: [
    { gamePlayerId: { in: playerIds } },
    {
      kind: 'claim' as const,
      claimEntityId: { in: claimIds },
      // A chest read before its kind was known counts
      OR: [{ buildingId: null }, { buildingId: { notIn: excludedBuildingIds } }],
    },
  ],
})

/** ownedBy in SQL, for the container `c` */
const ownedBySql = ({ playerIds, claimIds, excludedBuildingIds = [] }: StockOwners) => Prisma.sql`(
  c.game_player_id = ANY(${playerIds}::int[])
  OR (c.kind = 'claim' AND c.claim_entity_id = ANY(${claimIds}::text[])
      AND (c.building_id IS NULL OR NOT c.building_id = ANY(${excludedBuildingIds}::int[]))))`

/**
 * Every entry of the owners, with its place, owner and item; only items
 * whose name has every word of `q`
 */
function entries(owners: StockOwners, q?: string) {
  const words = searchWords(q)
  return db.$queryRaw<EntryRow[]>`
    SELECT e.item_id, e.quantity, c.id AS container_id, c.name AS container_name,
           c.kind::text AS kind, c.claim_name, p.id AS player_id, p.username,
           i.name, i.tier, i.rarity, i.icon_asset_name
    FROM inventory_entries e
    JOIN inventory_containers c ON c.id = e.container_id
    JOIN items i ON i.id = e.item_id
    LEFT JOIN game_players p ON p.id = c.game_player_id
    WHERE ${ownedBySql(owners)}
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
  owners: StockOwners,
  tab: InventoryTab,
  q?: string
): Promise<{ sections: StockSection[] }> {
  const rows = await entries(owners, q)

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

/** The owners' total of each item: what the calculator can use as "já tenho" */
export async function stockTotals(owners: StockOwners): Promise<Map<number, number>> {
  const rows = await db.inventoryEntry.groupBy({
    by: ['itemId'],
    where: { container: ownedBy(owners) },
    _sum: { quantity: true },
  })
  return new Map(rows.map((row) => [row.itemId, Number(row._sum.quantity ?? 0)]))
}

/**
 * Each item's holders among the owners, the one with most first, with their
 * places by name (the plan's "Coletar" and the Tasks page). Places of an owner
 * with the same name (two "Baú de madeira") add up.
 */
export async function holdersByItem(owners: StockOwners): Promise<Map<number, ItemHolder[]>> {
  const rows = await db.$queryRaw<
    {
      item_id: number
      quantity: number
      username: string | null
      claim_name: string | null
      container_name: string
    }[]
  >`
    SELECT e.item_id, e.quantity, p.username, c.claim_name, c.name AS container_name
    FROM inventory_entries e
    JOIN inventory_containers c ON c.id = e.container_id
    LEFT JOIN game_players p ON p.id = c.game_player_id
    WHERE ${ownedBySql(owners)}`

  // item → owner → place name → quantity
  const byItem = new Map<number, Map<string, Map<string, number>>>()
  for (const row of rows) {
    const owners = byItem.get(row.item_id) ?? new Map<string, Map<string, number>>()
    const places = owners.get(ownerOf(row)) ?? new Map<string, number>()
    places.set(row.container_name, (places.get(row.container_name) ?? 0) + Number(row.quantity))
    owners.set(ownerOf(row), places)
    byItem.set(row.item_id, owners)
  }
  const largest = <T extends { quantity: number }>(list: T[], key: (entry: T) => string) =>
    list.sort((a, b) => b.quantity - a.quantity || key(a).localeCompare(key(b)))
  return new Map(
    [...byItem].map(([itemId, owners]) => [
      itemId,
      largest(
        [...owners].map(([owner, places]) => ({
          owner,
          quantity: [...places.values()].reduce((sum, quantity) => sum + quantity, 0),
          places: largest(
            [...places].map(([name, quantity]) => ({ name, quantity })),
            (place) => place.name
          ),
        })),
        (holder) => holder.owner
      ),
    ])
  )
}

/** Where the owners keep an item, and how many in all (the item page) */
export async function itemStock(itemId: number, owners: StockOwners) {
  const rows = await db.inventoryEntry.findMany({
    where: { itemId, container: ownedBy(owners) },
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
