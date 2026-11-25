import type { NextRequest } from 'next/server'
import { userFromRequest } from '@/lib/session'
import { followedPlayerIds } from '@/models/game_player'
import { inventorySource } from '@/services/game_sync/inventory_source'
import InventorySync, {
  SYNC_RESULTS,
  SyncAlreadyRunningError,
} from '@/services/game_sync/inventory_sync'
import { syncIfStale } from '@/services/game_sync/stale_sync'
import { inventorySyncSchema } from '@/validators/inventory'

/** BitJita answers in a few seconds; the default limit is enough, this is a ceiling */
export const maxDuration = 60

export interface SyncResponse {
  /** Something changed (new data, or a run the page reports): show the page again */
  refresh: boolean
  /** What "Sincronizar agora" says; null for the sync on demand */
  notice: string | null
  ok: boolean
}

const answer = (body: SyncResponse) => Response.json(body)

/**
 * POST /api/inventory/sync: reads the account's characters on BitJita.
 * "Sincronizar agora" (in the inventory, the calculator and the plans) reads
 * them all, even when recent. `onlyIfStale`: a page found the inventory old
 * (INVENTORY_STALE_MINUTES) and reads only the old ones, nothing when another
 * tab or account just did it or a sync is running; a problem stays in the
 * sync's notes. A route handler, not a server action: Next runs a tab's
 * actions one at a time, so a sync of several seconds held every save of the
 * page behind it. The page shows the new data when this answers.
 */
export async function POST(request: NextRequest) {
  const user = await userFromRequest(request)
  if (!user) return Response.json({ error: 'Faça login para continuar.' }, { status: 401 })
  const body = inventorySyncSchema.safeParse(await request.json().catch(() => ({})))
  if (!body.success) return Response.json({ error: 'Pedido inválido.' }, { status: 400 })

  if (body.data.onlyIfStale) {
    let synced = false
    try {
      synced = (await syncIfStale(inventorySource(), user.id)) !== null
    } catch (error) {
      if (!(error instanceof SyncAlreadyRunningError)) {
        console.error('inventory sync (auto) failed', error)
      }
    }
    return answer({ refresh: synced, notice: null, ok: synced })
  }

  try {
    const run = await new InventorySync(inventorySource()).run('manual', {
      userId: user.id,
      playerIds: await followedPlayerIds(user.id),
    })
    const status = run.status === 'running' ? 'failed' : run.status
    return answer({ refresh: true, notice: SYNC_RESULTS[status], ok: run.status === 'ok' })
  } catch (error) {
    if (error instanceof SyncAlreadyRunningError) {
      return answer({ refresh: false, notice: error.message, ok: false })
    }
    // The run is marked failed, with the error, and the page shows it
    console.error('inventory sync (manual) failed', error)
    return answer({ refresh: true, notice: SYNC_RESULTS.failed, ok: false })
  }
}
