import { db } from '@/lib/db'

/**
 * Inventory syncs with BitJita: when, how they started and how they went.
 */

const newestFirst = [{ startedAt: 'desc' as const }, { id: 'desc' as const }]

export function latestSyncRun() {
  return db.syncRun.findFirst({ orderBy: newestFirst })
}

/** The last sync that wrote data (ok or partial) */
export function lastSuccessfulSyncRun() {
  return db.syncRun.findFirst({
    where: { status: { in: ['ok', 'partial'] } },
    orderBy: newestFirst,
  })
}
