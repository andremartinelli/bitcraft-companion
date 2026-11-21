import db from '@adonisjs/lucid/services/db'
import { CONTAINER_KINDS, type ContainerKind } from '#models/inventory_container'
import Item from '#models/item'

export type InventoryTab = 'group' | 'players' | 'places'

export interface StockLine {
  item: Item
  quantity: number
  /** How many places hold it (group tab) */
  places: number
}

export interface StockSection {
  title: string
  subtitle: string | null
  lines: StockLine[]
}

export interface ItemPlace {
  container: string
  owner: string
  quantity: number
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
  const totals = new Map<number, { quantity: number; places: Set<number> }>()
  for (const row of rows) {
    const total = totals.get(row.item_id) ?? { quantity: 0, places: new Set<number>() }
    total.quantity += Number(row.quantity)
    total.places.add(row.container_id)
    totals.set(row.item_id, total)
  }
  return [...totals]
    .filter(([itemId]) => items.has(itemId))
    .map(([itemId, total]) => ({
      item: items.get(itemId)!,
      quantity: total.quantity,
      places: total.places.size,
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
 * The inventory page: the group's stock (one line per item), per player
 * (claim chests apart, since they belong to everyone) or per place.
 */
export async function inventoryListing(tab: InventoryTab, q?: string) {
  const rows = await entries(q)
  const items = await itemsById(rows.map((row) => row.item_id))

  if (tab === 'group') {
    return { sections: [{ title: 'Grupo', subtitle: null, lines: toLines(rows, items) }] }
  }

  if (tab === 'players') {
    const byOwner = groupBy(rows, (row) =>
      row.player_id !== null ? `p:${row.username}` : `c:${row.claim_name ?? ''}`
    )
    const sections: StockSection[] = [...byOwner.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, ownerRows]) => ({
        title: ownerOf(ownerRows[0]),
        subtitle: key.startsWith('c:') ? 'baús compartilhados pelo grupo' : null,
        lines: toLines(ownerRows, items),
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
