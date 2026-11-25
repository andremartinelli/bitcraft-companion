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

/** The daily cron reads characters nobody looked at for this long */
export const CRON_STALE_MINUTES = 60
/** At most this many per run: a Vercel function stops at 60 s, and BitJita takes 2 calls a second */
export const MAX_PLAYERS_PER_SYNC = 20

const notTriedSince = (minutes: number, now: Date) => ({
  OR: [
    { lastAttemptAt: null },
    { lastAttemptAt: { lt: new Date(now.getTime() - minutes * 60_000) } },
  ],
})

const leastRecentlyTried = [
  { lastAttemptAt: { sort: 'asc' as const, nulls: 'first' as const } },
  { id: 'asc' as const },
]

export interface InventoryFreshness {
  /** There are characters: without them there is nothing to read */
  hasPlayers: boolean
  /** Some of them were not tried in the last minutes, read or not */
  stale: boolean
}

/**
 * Whether a page's characters (services/inventory/scope) should be read
 * again. A failed read also counts as recent: when BitJita is down, the pages
 * don't keep asking it.
 */
export async function inventoryFreshness(
  playerIds: number[],
  minutes = staleMinutes(),
  now: Date = new Date()
): Promise<InventoryFreshness> {
  const stale = await db.gamePlayer.count({
    where: { id: { in: playerIds }, ...notTriedSince(minutes, now) },
  })
  return { hasPlayers: playerIds.length > 0, stale: stale > 0 }
}

/**
 * "Sincronizar agora": the characters to read, the least recently tried
 * first, up to MAX_PLAYERS_PER_SYNC (a plan with many people takes turns)
 */
export async function playersToSync(playerIds: number[]) {
  const players = await db.gamePlayer.findMany({
    where: { id: { in: playerIds } },
    orderBy: leastRecentlyTried,
    take: MAX_PLAYERS_PER_SYNC,
    select: { id: true },
  })
  return players.map((player) => player.id)
}

/**
 * The sync on demand: a page that shows an inventory reads its characters
 * that are old (`auto`), the least recently tried first, up to
 * MAX_PLAYERS_PER_SYNC. Characters another account read a moment ago are not
 * read again. Then the history forgets runs older than 7 days.
 *
 * @throws SyncAlreadyRunningError when a sync is in progress
 */
export async function syncIfStale(
  source: InventorySource,
  userId: number,
  playerIds: number[],
  minutes = staleMinutes(),
  now: Date = new Date()
): Promise<SyncRun | null> {
  const stale = await db.gamePlayer.findMany({
    where: { id: { in: playerIds }, ...notTriedSince(minutes, now) },
    orderBy: leastRecentlyTried,
    take: MAX_PLAYERS_PER_SYNC,
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
 * The daily cron (`cron`): the accounts' characters nobody looked at in the
 * last hour, the oldest first, up to MAX_PLAYERS_PER_SYNC. There is no timer: the
 * database sleeps while nobody uses the app.
 *
 * @throws SyncAlreadyRunningError when a sync is in progress
 */
export async function cronSync(source: InventorySource, now: Date = new Date()) {
  const players = await db.gamePlayer.findMany({
    where: { accounts: { some: {} }, ...notTriedSince(CRON_STALE_MINUTES, now) },
    orderBy: leastRecentlyTried,
    take: MAX_PLAYERS_PER_SYNC,
    select: { id: true },
  })
  if (!players.length) return null
  const run = await new InventorySync(source).run('cron', {
    playerIds: players.map((player) => player.id),
  })
  await pruneSyncRuns(now)
  return run
}
