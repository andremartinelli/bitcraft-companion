'use server'

import { refresh } from 'next/cache'
import { requireUser } from '@/lib/session'
import { followedPlayerIds } from '@/models/game_player'
import { inventorySource } from '@/services/game_sync/inventory_source'
import InventorySync, {
  SYNC_RESULTS,
  SyncAlreadyRunningError,
} from '@/services/game_sync/inventory_sync'
import * as staleSync from '@/services/game_sync/stale_sync'

export interface SyncResult {
  /** "Sincronização concluída.", "Já existe uma sincronização em andamento."... */
  notice: string
  ok: boolean
}

/**
 * POST /inventory/sync, "Sincronizar agora" (in the inventory, the calculator
 * and the plans): reads the account's characters on BitJita now, even when
 * the last read is recent. Then the page shows the new data.
 */
export async function syncNow(): Promise<SyncResult> {
  const user = await requireUser()
  let result: SyncResult
  try {
    const run = await new InventorySync(inventorySource()).run('manual', {
      userId: user.id,
      playerIds: await followedPlayerIds(user.id),
    })
    const status = run.status === 'running' ? 'failed' : run.status
    result = { notice: SYNC_RESULTS[status], ok: run.status === 'ok' }
  } catch (error) {
    if (error instanceof SyncAlreadyRunningError) {
      result = { notice: error.message, ok: false }
    } else {
      // The run is marked failed, with the error, and the page shows it
      console.error('inventory sync (manual) failed', error)
      result = { notice: SYNC_RESULTS.failed, ok: false }
    }
  }
  refresh()
  return result
}

/**
 * A page that shows the inventory found it old (INVENTORY_STALE_MINUTES):
 * reads the account's old characters again, unless they are no longer old
 * (another tab or account did it) or a sync is running. Never fails the
 * page: a problem stays in the sync's notes.
 */
export async function syncIfStale(): Promise<{ synced: boolean }> {
  const user = await requireUser()
  let synced = false
  try {
    synced = (await staleSync.syncIfStale(inventorySource(), user.id)) !== null
  } catch (error) {
    if (!(error instanceof SyncAlreadyRunningError)) {
      console.error('inventory sync (auto) failed', error)
    }
  }
  if (synced) refresh()
  return { synced }
}
