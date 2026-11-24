import { db } from '@/lib/db'
import type { ItemHolder } from '@/services/inventory/professions'

/**
 * The group's stock, as of the last sync. The inventory page's listing comes
 * with the inventory (stage 8); the calculator needs only these two.
 */

/** "Nimbus" for a player's container, "Claim Vila" for a shared chest */
const ownerOf = (row: { username: string | null; claim_name: string | null }) =>
  row.username ?? (row.claim_name ? `Claim ${row.claim_name}` : 'Claim')

/** The group's total of each item: what the calculator can use as "já tenho" */
export async function groupTotals(): Promise<Map<number, number>> {
  const rows = await db.inventoryEntry.groupBy({ by: ['itemId'], _sum: { quantity: true } })
  return new Map(rows.map((row) => [row.itemId, Number(row._sum.quantity ?? 0)]))
}

/** Each item's holders, the one with most first (the plan's "Coletar") */
export async function holdersByItem(): Promise<Map<number, ItemHolder[]>> {
  const rows = await db.$queryRaw<
    { item_id: number; quantity: number; username: string | null; claim_name: string | null }[]
  >`
    SELECT e.item_id, e.quantity, p.username, c.claim_name
    FROM inventory_entries e
    JOIN inventory_containers c ON c.id = e.container_id
    LEFT JOIN game_players p ON p.id = c.game_player_id`

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
