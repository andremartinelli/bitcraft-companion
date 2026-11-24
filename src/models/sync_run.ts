import type { SyncStatus } from '@/generated/prisma/client.ts'
import { db } from '@/lib/db'

/**
 * Inventory syncs with BitJita: when, how they started and how they went.
 * Only one runs at a time: a partial unique index (sync_runs_one_running,
 * in the first migration) refuses a second row with status "running".
 */

export const SYNC_STATUS_LABELS: Record<SyncStatus, string> = {
  running: 'em andamento',
  ok: 'concluída',
  partial: 'parcial',
  failed: 'falhou',
}

/** A run still "running" after this long died with its function (Vercel stops them at 60 s) */
export const ABANDONED_AFTER_MINUTES = 5

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

/** Closes the runs a dead function left "running", so they no longer block a new one */
export function closeAbandonedRuns(now: Date = new Date()) {
  return db.syncRun.updateMany({
    where: {
      status: 'running',
      startedAt: { lt: new Date(now.getTime() - ABANDONED_AFTER_MINUTES * 60_000) },
    },
    data: { status: 'failed', message: 'Interrompida antes de terminar.', finishedAt: now },
  })
}
