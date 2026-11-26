import { db } from '@/lib/db'
import type { CalculatorState } from '@/services/calculator/production_planner'
import type { StockOwners } from '@/services/inventory/scope'
import { holdersByItem, stockTotals } from '@/services/inventory/stock'

export type OwnedSource = 'manual' | 'inventory'

export interface InventoryOption {
  /** Some of the characters was read: "já tenho" comes from the inventory */
  available: boolean
  syncedAt: Date | null
}

/**
 * "Já tenho" of each item: a value typed by hand wins, even 0; without one,
 * the characters' total in the inventory.
 */
export function mergeOwned(
  manual: Record<number, number>,
  inventory: Map<number, number> | null
): { owned: Record<number, number>; sources: Record<number, OwnedSource> } {
  const owned: Record<number, number> = {}
  const sources: Record<number, OwnedSource> = {}
  for (const [itemId, quantity] of inventory ?? []) {
    if (quantity > 0) {
      owned[itemId] = quantity
      sources[itemId] = 'inventory'
    }
  }
  for (const [itemId, quantity] of Object.entries(manual)) {
    owned[Number(itemId)] = quantity
    sources[Number(itemId)] = 'manual'
  }
  return { owned, sources }
}

/**
 * The state the planner runs on: the stock of the page's characters
 * (services/inventory/scope) fills "já tenho", always once one of them was
 * read. The planner stays a pure function of that state. `holders` says who
 * has each item, for the page. `syncedAt`: the oldest read among them.
 */
export async function withInventory(state: CalculatorState, owners: StockOwners) {
  const oldest = await db.gamePlayer.findFirst({
    where: { id: { in: owners.playerIds }, lastSyncedAt: { not: null } },
    orderBy: { lastSyncedAt: 'asc' },
    select: { lastSyncedAt: true },
  })
  const inventory: InventoryOption = {
    available: oldest !== null,
    syncedAt: oldest?.lastSyncedAt ?? null,
  }
  const [totals, holders] = inventory.available
    ? await Promise.all([stockTotals(owners), holdersByItem(owners)])
    : [null, null]
  const { owned, sources } = mergeOwned(state.owned, totals)
  return { planState: { ...state, owned }, sources, totals, holders, inventory }
}
