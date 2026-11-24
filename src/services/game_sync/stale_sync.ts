import type { SyncRun } from '@/generated/prisma/client.ts'
import { db } from '@/lib/db'
import { latestSyncRun } from '@/models/sync_run'
import type { InventorySource } from '@/services/game_sync/inventory_source'
import InventorySync from '@/services/game_sync/inventory_sync'

/** Minutes until the inventory is old enough to read again (INVENTORY_STALE_MINUTES) */
export function staleMinutes() {
  const minutes = Number(process.env.INVENTORY_STALE_MINUTES)
  return minutes > 0 ? minutes : 15
}

export interface InventoryFreshness {
  /** Someone to read: without characters there is nothing to sync */
  hasPlayers: boolean
  /** There are characters and no sync started in the last minutes, in any status */
  stale: boolean
}

/**
 * Whether the inventory should be read again. A failed sync also counts as
 * recent: when BitJita is down, the pages don't keep asking it.
 */
export async function inventoryFreshness(
  minutes = staleMinutes(),
  now: Date = new Date()
): Promise<InventoryFreshness> {
  const [players, latest] = await Promise.all([db.gamePlayer.count(), latestSyncRun()])
  const hasPlayers = players > 0
  const recent = latest !== null && latest.startedAt.getTime() > now.getTime() - minutes * 60_000
  return { hasPlayers, stale: hasPlayers && !recent }
}

/**
 * The sync on demand (a page that shows the inventory, `auto`) and the daily
 * cron (`cron`): only when there is someone to read and the last sync is old.
 * There is no timer: the database sleeps while nobody uses the app.
 *
 * @throws SyncAlreadyRunningError when a sync is in progress
 */
export async function syncIfStale(
  source: InventorySource,
  trigger: 'auto' | 'cron',
  minutes = staleMinutes(),
  now: Date = new Date()
): Promise<SyncRun | null> {
  const { stale } = await inventoryFreshness(minutes, now)
  if (!stale) return null
  return new InventorySync(source).run(trigger)
}
