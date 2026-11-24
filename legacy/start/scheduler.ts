/*
|--------------------------------------------------------------------------
| Inventory schedule
|--------------------------------------------------------------------------
|
| Syncs the inventories with BitJita every INVENTORY_SYNC_MINUTES (1 by
| default, 0 turns it off). Preloaded only by the web server (adonisrc.ts):
| never by ace commands or tests.
|
*/

import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { BitJitaInventorySource } from '#services/game_sync/inventory_source'
import { SyncAlreadyRunningError } from '#services/game_sync/inventory_sync'
import { DEFAULT_SYNC_MINUTES, scheduledSync } from '#services/game_sync/scheduled_sync'

const minutes = env.get('INVENTORY_SYNC_MINUTES', DEFAULT_SYNC_MINUTES)

if (minutes > 0) {
  const tick = async () => {
    try {
      const source = await app.container.make(BitJitaInventorySource)
      const run = await scheduledSync(source, minutes)
      if (run) logger.info({ status: run.status, counts: run.counts }, 'inventory sync (schedule)')
    } catch (error) {
      if (error instanceof SyncAlreadyRunningError) return
      logger.error({ err: error }, 'inventory sync (schedule) failed')
    }
  }

  const timer = setInterval(tick, minutes * 60_000)
  timer.unref()
  app.terminating(() => clearInterval(timer))
  logger.info(`inventory sync every ${minutes} min`)
}
