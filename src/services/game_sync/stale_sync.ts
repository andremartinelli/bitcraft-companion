import type { SyncRun } from '@/generated/prisma/client.ts'
import { db } from '@/lib/db'
import { pruneSyncRuns } from '@/models/sync_run'
import type { InventorySource } from '@/services/game_sync/inventory_source'
import InventorySync from '@/services/game_sync/inventory_sync'

/**
 * Minutes until a character's inventory is old enough to read again
 * (INVENTORY_STALE_MINUTES). 1 by default, as the old app's timer since
 * 24/11/2026: about 4 calls to BitJita per character, far below its 250 a minute.
 */
export function staleMinutes() {
  const minutes = Number(process.env.INVENTORY_STALE_MINUTES)
  return minutes > 0 ? minutes : 1
}

/** The daily cron reads characters nobody looked at for this long... */
export const CRON_STALE_MINUTES = 60
/** ...at most this many per run: a Vercel function stops at 60 s, and BitJita takes 2 calls a second */
export const CRON_MAX_PLAYERS = 20

const notTriedSince = (minutes: number, now: Date) => ({
  OR: [
    { lastAttemptAt: null },
    { lastAttemptAt: { lt: new Date(now.getTime() - minutes * 60_000) } },
  ],
})

export interface InventoryFreshness {
  /** The account follows someone: without characters there is nothing to read */
  hasPlayers: boolean
  /** Some of its characters were not tried in the last minutes, read or not */
  stale: boolean
}

/**
 * Whether an account's inventory should be read again. A failed read also
 * counts as recent: when BitJita is down, the pages don't keep asking it.
 */
export async function inventoryFreshness(
  userId: number,
  minutes = staleMinutes(),
  now: Date = new Date()
): Promise<InventoryFreshness> {
  const followed = { followers: { some: { userId } } }
  const [players, stale] = await Promise.all([
    db.gamePlayer.count({ where: followed }),
    db.gamePlayer.count({ where: { ...followed, ...notTriedSince(minutes, now) } }),
  ])
  return { hasPlayers: players > 0, stale: stale > 0 }
}

/**
 * The sync on demand: a page that shows an account's inventory reads its
 * characters that are old (`auto`). Characters another account read a moment
 * ago are not read again. Then the history forgets runs older than 7 days.
 *
 * @throws SyncAlreadyRunningError when a sync is in progress
 */
export async function syncIfStale(
  source: InventorySource,
  userId: number,
  minutes = staleMinutes(),
  now: Date = new Date()
): Promise<SyncRun | null> {
  const stale = await db.gamePlayer.findMany({
    where: { followers: { some: { userId } }, ...notTriedSince(minutes, now) },
    select: { id: true },
  })
  if (!stale.length) return null
  const run = await new InventorySync(source).run('auto', {
    userId,
    playerIds: stale.map((player) => player.id),
  })
  await pruneSyncRuns(now)
  return run
}

/**
 * The daily cron (`cron`): the followed characters nobody looked at in the
 * last hour, the oldest first, up to CRON_MAX_PLAYERS. There is no timer: the
 * database sleeps while nobody uses the app.
 *
 * @throws SyncAlreadyRunningError when a sync is in progress
 */
export async function cronSync(source: InventorySource, now: Date = new Date()) {
  const players = await db.gamePlayer.findMany({
    where: { followers: { some: {} }, ...notTriedSince(CRON_STALE_MINUTES, now) },
    orderBy: [{ lastAttemptAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
    take: CRON_MAX_PLAYERS,
    select: { id: true },
  })
  if (!players.length) return null
  const run = await new InventorySync(source).run('cron', {
    playerIds: players.map((player) => player.id),
  })
  await pruneSyncRuns(now)
  return run
}
