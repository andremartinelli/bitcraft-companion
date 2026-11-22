import db from '@adonisjs/lucid/services/db'
import { CONTAINER_KINDS, type ContainerKind } from '#models/inventory_container'
import Item from '#models/item'
import { defaultProducer, producersOf } from '#services/calculator/production_planner'
import RecipeGraph from '#services/calculator/recipe_graph'

export type InventoryTab = 'professions' | 'group' | 'players' | 'places'

export interface ItemPlace {
  container: string
  owner: string
  quantity: number
}

export interface StockLine {
  item: Item
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
}

const KIND_ORDER = Object.keys(CONTAINER_KINDS)

/** Items no recipe makes: gathered, dropped or bought */
export const NO_PROFESSION = 'Sem receita (coleta, drop ou loja)'

/** The game's "ANY" skill: recipes any profession can do */
export const ANY_PROFESSION = 'Qualquer profissão'

/** Named professions first, alphabetically; then "any"; then "no recipe" */
const professionRank = (name: string) =>
  name === NO_PROFESSION ? 2 : name === ANY_PROFESSION ? 1 : 0

/** "Nimbus" for a player's container, "Claim Vila" for a shared chest */
const ownerOf = (row: EntryRow) =>
  row.username ?? (row.claim_name ? `Claim ${row.claim_name}` : 'Claim')

function entries(q?: string) {
  const query = db
    .from('inventory_entries as e')
    .join('inventory_containers as c', 'c.id', 'e.container_id')
    .join('items as i', 'i.id', 'e.item_id')
    .leftJoin('game_players as p', 'p.id', 'c.game_player_id')
    .select(
      'e.item_id',
      'e.quantity',
      'c.id as container_id',
      'c.name as container_name',
      'c.kind',
      'c.claim_name',
      'p.id as player_id',
      'p.username'
    )
  const words = (q ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  for (const word of words) {
    query.whereRaw(`i.name LIKE ? ESCAPE '\\'`, [`%${word.replace(/[%_\\]/g, '\\$&')}%`])
  }
  return query as Promise<EntryRow[]>
}

async function itemsById(ids: Iterable<number>) {
  const list = [...new Set(ids)]
  if (!list.length) return new Map<number, Item>()
  const items = await Item.query().whereIn('id', list)
  return new Map(items.map((item) => [item.id, item]))
}

function toLines(rows: EntryRow[], items: Map<number, Item>): StockLine[] {
  const byItem = new Map<number, ItemPlace[]>()
  for (const row of rows) {
    const places = byItem.get(row.item_id) ?? []
    places.push({
      container: row.container_name,
      owner: ownerOf(row),
      quantity: Number(row.quantity),
    })
    byItem.set(row.item_id, places)
  }
  return [...byItem]
    .filter(([itemId]) => items.has(itemId))
    .map(([itemId, where]) => ({
      item: items.get(itemId)!,
      quantity: where.reduce((sum, place) => sum + place.quantity, 0),
      where: where.sort((a, b) => b.quantity - a.quantity || a.owner.localeCompare(b.owner)),
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
 * group's total, each player's own things (the claim chests belong to
 * everyone, so they stay out), or each place.
 */
export async function inventoryListing(tab: InventoryTab, q?: string) {
  const rows = await entries(q)
  const items = await itemsById(rows.map((row) => row.item_id))

  if (tab === 'professions') {
    const graph = await RecipeGraph.current()
    const byProfession = groupBy(rows, (row) => professionOf(graph, row.item_id))
    const sections: StockSection[] = [...byProfession]
      .sort(([a], [b]) => professionRank(a) - professionRank(b) || a.localeCompare(b))
      .map(([profession, professionRows]) => ({
        key: `professions:${profession}`,
        title: profession,
        subtitle: null,
        lines: toLines(professionRows, items),
      }))
    return { sections }
  }

  if (tab === 'group') {
    return {
      sections: [{ key: 'group', title: 'Grupo', subtitle: null, lines: toLines(rows, items) }],
    }
  }

  if (tab === 'players') {
    const byPlayer = groupBy(
      rows.filter((row) => row.player_id !== null),
      (row) => row.player_id
    )
    const sections: StockSection[] = [...byPlayer.values()]
      .sort((a, b) => ownerOf(a[0]).localeCompare(ownerOf(b[0])))
      .map((playerRows) => ({
        key: `players:${playerRows[0].player_id}`,
        title: ownerOf(playerRows[0]),
        subtitle: 'mochila, cinto, carteira, banco, stash, casa e veículos',
        lines: toLines(playerRows, items),
      }))
    return { sections }
  }

  const byContainer = groupBy(rows, (row) => row.container_id)
  const sections: StockSection[] = [...byContainer.values()]
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
        lines: toLines(containerRows, items),
      }
    })
  return { sections }
}

/** The group's total of each item: what the calculator can use as "já tenho" */
export async function groupTotals(): Promise<Map<number, number>> {
  const rows: { item_id: number; total: number | string }[] = await db
    .from('inventory_entries')
    .groupBy('item_id')
    .select('item_id')
    .sum('quantity as total')
  return new Map(rows.map((row) => [row.item_id, Number(row.total)]))
}

/** Who has an item and how many, all of their places together */
export interface ItemHolder {
  owner: string
  quantity: number
}

/** Each item's holders, the one with most first (the plan's "Coletar") */
export async function holdersByItem(): Promise<Map<number, ItemHolder[]>> {
  const byItem = new Map<number, Map<string, number>>()
  for (const row of await entries()) {
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

/** Where the group keeps an item (item page) */
export async function itemStock(itemId: number) {
  const rows: EntryRow[] = await db
    .from('inventory_entries as e')
    .join('inventory_containers as c', 'c.id', 'e.container_id')
    .leftJoin('game_players as p', 'p.id', 'c.game_player_id')
    .where('e.item_id', itemId)
    .select(
      'e.item_id',
      'e.quantity',
      'c.id as container_id',
      'c.name as container_name',
      'c.kind',
      'c.claim_name',
      'p.id as player_id',
      'p.username'
    )
  const places: ItemPlace[] = rows
    .map((row) => ({
      container: row.container_name,
      owner: ownerOf(row),
      quantity: Number(row.quantity),
    }))
    .sort((a, b) => b.quantity - a.quantity || a.owner.localeCompare(b.owner))
  return { total: places.reduce((sum, place) => sum + place.quantity, 0), places }
}
