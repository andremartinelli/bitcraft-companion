import type { DateTime } from 'luxon'
import SyncRun from '#models/sync_run'
import type { CalculatorState } from '#services/calculator/production_planner'
import { groupTotals } from '#services/inventory/stock'

export type OwnedSource = 'manual' | 'inventory'

export interface InventoryOption {
  /** Some sync wrote data: the option can be offered */
  available: boolean
  /** The option is on and there is data to use */
  enabled: boolean
  syncedAt: DateTime | null
}

/**
 * "Já tenho" of each item: a value typed by hand wins, even 0; without one,
 * the group's total in the inventory.
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
 * The state the planner runs on: with "Usar inventário do grupo" on (the
 * default once a sync exists), the group's stock fills "já tenho". The
 * planner stays a pure function of that state.
 */
export async function withInventory(state: CalculatorState) {
  const lastSync = await SyncRun.lastSuccessful()
  const inventory: InventoryOption = {
    available: lastSync !== null,
    enabled: lastSync !== null && state.useInventory !== false,
    syncedAt: lastSync ? (lastSync.finishedAt ?? lastSync.startedAt) : null,
  }
  const totals = inventory.enabled ? await groupTotals() : null
  const { owned, sources } = mergeOwned(state.owned, totals)
  return { planState: { ...state, owned }, sources, totals, inventory }
}
