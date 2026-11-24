import type { SyncStatus } from '@/generated/prisma/client.ts'
import { db } from '@/lib/db'

/**
 * Inventory syncs with BitJita: when, how they started and how they went.
 * Each run belongs to the account whose characters it read (none for the cron).
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

/** An account's latest sync, in any status */
export function latestSyncRun(userId: number) {
  return db.syncRun.findFirst({ where: { userId }, orderBy: newestFirst })
}

/** An account's last sync that wrote data (ok or partial) */
export function lastSuccessfulSyncRun(userId: number) {
  return db.syncRun.findFirst({
    where: { userId, status: { in: ['ok', 'partial'] } },
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

/** The history keeps this many days of runs (see pruneSyncRuns) */
export const KEEP_DAYS = 7

/**
 * Forgets runs older than KEEP_DAYS, after each automatic sync. Each
 * account's last run that wrote data stays, however old: the inventory page
 * says when the data is from.
 */
export async function pruneSyncRuns(now: Date = new Date()) {
  const lastGood = await db.syncRun.groupBy({
    by: ['userId'],
    where: { status: { in: ['ok', 'partial'] } },
    _max: { id: true },
  })
  const keep = lastGood.flatMap((row) => (row._max.id === null ? [] : [row._max.id]))
  return db.syncRun.deleteMany({
    where: {
      startedAt: { lt: new Date(now.getTime() - KEEP_DAYS * 24 * 3_600_000) },
      id: { notIn: keep },
    },
  })
}
