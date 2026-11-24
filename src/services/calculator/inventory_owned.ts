import { db } from '@/lib/db'
import type { CalculatorState } from '@/services/calculator/production_planner'
import { holdersByItem, stockTotals } from '@/services/inventory/stock'

export type OwnedSource = 'manual' | 'inventory'

export interface InventoryOption {
  /** Some of the account's characters was read: the option can be offered */
  available: boolean
  /** The option is on and there is data to use */
  enabled: boolean
  syncedAt: Date | null
}

/**
 * "Já tenho" of each item: a value typed by hand wins, even 0; without one,
 * the total of the account's characters in the inventory.
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
 * The state the planner runs on: with "Usar o inventário" on (the default
 * once a character of the account was read), the stock of the characters the
 * viewing account follows fills "já tenho". In a shared plan each account sees
 * its own. The planner stays a pure function of that state. `holders` says
 * who has each item, for the page. `syncedAt`: the oldest read among them.
 */
export async function withInventory(state: CalculatorState, userId: number) {
  const oldest = await db.gamePlayer.findFirst({
    where: { followers: { some: { userId } }, lastSyncedAt: { not: null } },
    orderBy: { lastSyncedAt: 'asc' },
    select: { lastSyncedAt: true },
  })
  const inventory: InventoryOption = {
    available: oldest !== null,
    enabled: oldest !== null && state.useInventory !== false,
    syncedAt: oldest?.lastSyncedAt ?? null,
  }
  const [totals, holders] = inventory.enabled
    ? await Promise.all([stockTotals(userId), holdersByItem(userId)])
    : [null, null]
  const { owned, sources } = mergeOwned(state.owned, totals)
  return { planState: { ...state, owned }, sources, totals, holders, inventory }
}
