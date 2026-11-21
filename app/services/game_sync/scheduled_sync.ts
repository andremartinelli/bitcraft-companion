import { DateTime } from 'luxon'
import GamePlayer from '#models/game_player'
import SyncRun from '#models/sync_run'
import type { InventorySource } from '#services/game_sync/inventory_source'
import InventorySync from '#services/game_sync/inventory_sync'

export const DEFAULT_SYNC_MINUTES = 15

/**
 * One tick of the automatic sync (start/scheduler.ts). Skips when there is
 * nobody to read, or when a sync started recently (someone pressed the
 * button): no point asking BitJita again so soon.
 *
 * @throws SyncAlreadyRunningError when a sync is in progress
 */
export async function scheduledSync(
  source: InventorySource,
  minutes: number,
  now: DateTime = DateTime.now()
): Promise<SyncRun | null> {
  if (!(await GamePlayer.query().first())) return null

  const latest = await SyncRun.latest()
  if (latest && latest.startedAt > now.minus({ minutes: minutes / 2 })) return null

  return new InventorySync(source).run('schedule')
}
