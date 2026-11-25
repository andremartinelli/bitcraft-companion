import { beforeEach, describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import {
  cronSync,
  inventoryFreshness,
  MAX_PLAYERS_PER_SYNC,
  playersToSync,
  staleMinutes,
  syncIfStale,
} from '@/services/game_sync/stale_sync'
import { bitjitaSource, everyPathAnswers, fakeBitJita, PLAYER_ONE } from '../../helpers/bitjita'
import { importTables } from '../../helpers/game_data'
import { addBothPlayers } from '../../helpers/inventory'

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000)

/** When a character was last tried */
const tried = (entityId: string, minutes: number) =>
  db.gamePlayer.update({ where: { entityId }, data: { lastAttemptAt: minutesAgo(minutes) } })

const pastRun = (days: number, status: 'ok' | 'failed', userId: number | null) =>
  db.syncRun.create({
    data: {
      trigger: 'manual',
      source: 'bitjita',
      status,
      userId,
      startedAt: minutesAgo(days * 24 * 60),
      finishedAt: minutesAgo(days * 24 * 60),
    },
  })

/** P0, P1...: characters of accounts, tried 120 + i minutes ago (the first two never) */
async function manyPlayers(count: number) {
  const ids: number[] = []
  for (let i = 0; i < count; i++) {
    const player = await db.gamePlayer.create({
      data: {
        username: `P${i}`,
        entityId: `90000000000000${String(i).padStart(4, '0')}`,
        lastAttemptAt: i < 2 ? null : minutesAgo(120 + i),
        accounts: { create: { email: `p${i}@example.com`, password: '-' } },
      },
    })
    ids.push(player.id)
  }
  return ids
}

/** The usernames of the characters not tried in the last hour */
const untried = async () =>
  (
    await db.gamePlayer.findMany({
      where: { lastAttemptAt: { lt: minutesAgo(60) } },
      select: { username: true },
    })
  )
    .map((p) => p.username)
    .sort()

describe('sync on demand, of the characters a page uses', () => {
  beforeEach(() => importTables())

  test('without characters there is nothing to read', async () => {
    const user = await db.user.create({ data: { email: 'a@example.com', password: '-' } })
    const fake = fakeBitJita()

    expect(await inventoryFreshness([], 15)).toEqual({ hasPlayers: false, stale: false })
    expect(await syncIfStale(bitjitaSource(fake), user.id, [], 15)).toBeNull()
    expect(fake.calls).toHaveLength(0)
    expect(await db.syncRun.count()).toBe(0)
  })

  test('characters never tried: the first sync, for this account', async () => {
    const { userId, playerIds } = await addBothPlayers()

    expect(await inventoryFreshness(playerIds, 15)).toEqual({ hasPlayers: true, stale: true })
    const run = await syncIfStale(bitjitaSource(), userId, playerIds, 15)
    expect([run?.trigger, run?.status, run?.userId]).toEqual(['auto', 'ok', userId])
  })

  test('only the characters that are old are read again', async () => {
    const { userId, playerIds } = await addBothPlayers()
    await tried(PLAYER_ONE.entityId, 3)
    const fake = fakeBitJita()

    await syncIfStale(bitjitaSource(fake), userId, playerIds, 15)

    expect(fake.calls.some((call) => call.path.includes(PLAYER_ONE.entityId))).toBe(false)
    expect(fake.calls.length).toBeGreaterThan(0)
  })

  test('tried a moment ago, even by another account or failing: nothing to do', async () => {
    const { userId, playerIds } = await addBothPlayers()
    await db.gamePlayer.updateMany({
      where: { id: { in: playerIds } },
      data: { lastAttemptAt: minutesAgo(3), lastError: 'a BitJita respondeu 503' },
    })
    const fake = fakeBitJita()

    expect((await inventoryFreshness(playerIds, 15)).stale).toBe(false)
    expect(await syncIfStale(bitjitaSource(fake), userId, playerIds, 15)).toBeNull()
    expect(fake.calls).toHaveLength(0)
  })

  test('only the characters given are read', async () => {
    const { userId, playerIds } = await addBothPlayers()
    const fake = fakeBitJita()

    await syncIfStale(bitjitaSource(fake), userId, [playerIds[1]], 15)

    expect(fake.calls.some((call) => call.path.includes(PLAYER_ONE.entityId))).toBe(false)
    expect(fake.calls.length).toBeGreaterThan(0)
  })

  test(`at most ${MAX_PLAYERS_PER_SYNC} characters, the least recently tried first`, async () => {
    const ids = await manyPlayers(MAX_PLAYERS_PER_SYNC + 2)
    const user = await db.user.create({ data: { email: 'b@example.com', password: '-' } })

    // "Sincronizar agora" takes turns in the same order
    expect(await playersToSync(ids)).toEqual(
      [ids[0], ids[1], ...ids.slice(2).reverse()].slice(0, MAX_PLAYERS_PER_SYNC)
    )
    // Every read fails (unknown ids): the count of characters is what matters
    const run = await syncIfStale(bitjitaSource(fakeBitJita({})), user.id, ids, 15)

    expect((run!.counts as { playersTotal: number }).playersTotal).toBe(MAX_PLAYERS_PER_SYNC)
    expect(await untried()).toEqual(['P2', 'P3'])
  })

  test("then the history forgets runs older than 7 days, but not each account's last good one", async () => {
    const { userId, playerIds } = await addBothPlayers()
    const lastGood = await pastRun(9, 'ok', userId)
    const failed = await pastRun(8, 'failed', userId)
    const cronGood = await pastRun(10, 'ok', null)
    const recent = await pastRun(6, 'failed', userId)

    const run = await syncIfStale(
      bitjitaSource(fakeBitJita(everyPathAnswers({ status: 503 }))),
      userId,
      playerIds,
      15
    )

    const ids = (await db.syncRun.findMany({ orderBy: { id: 'asc' } })).map((r) => r.id)
    expect(ids).toEqual([lastGood.id, cronGood.id, recent.id, run!.id])
    expect(ids).not.toContain(failed.id)
  })

  test('1 minute unless INVENTORY_STALE_MINUTES says otherwise', () => {
    const saved = process.env.INVENTORY_STALE_MINUTES
    try {
      process.env.INVENTORY_STALE_MINUTES = '30'
      expect(staleMinutes()).toBe(30)
      process.env.INVENTORY_STALE_MINUTES = 'nope'
      expect(staleMinutes()).toBe(1)
    } finally {
      process.env.INVENTORY_STALE_MINUTES = saved
    }
  })
})

describe('the daily cron', () => {
  beforeEach(() => importTables())

  test("reads the accounts' characters nobody looked at in the last hour", async () => {
    await addBothPlayers()
    await tried(PLAYER_ONE.entityId, 30)
    const fake = fakeBitJita()

    const run = await cronSync(bitjitaSource(fake))

    expect([run?.trigger, run?.userId, run?.status]).toEqual(['cron', null, 'ok'])
    expect(fake.calls.some((call) => call.path.includes(PLAYER_ONE.entityId))).toBe(false)
  })

  test('no account has them, or all were read recently: nothing to do', async () => {
    const { playerIds } = await addBothPlayers()
    await db.gamePlayer.updateMany({
      where: { id: { in: playerIds } },
      data: { lastAttemptAt: minutesAgo(10) },
    })
    expect(await cronSync(bitjitaSource())).toBeNull()

    await db.user.updateMany({ data: { gamePlayerId: null } })
    await db.gamePlayer.updateMany({ data: { lastAttemptAt: null } })
    expect(await cronSync(bitjitaSource())).toBeNull()
  })

  test(`at most ${MAX_PLAYERS_PER_SYNC} characters, the oldest first`, async () => {
    await manyPlayers(MAX_PLAYERS_PER_SYNC + 2)

    // Every read fails (unknown ids): the count of characters is what matters
    const run = await cronSync(bitjitaSource(fakeBitJita({})))

    expect((run!.counts as { playersTotal: number }).playersTotal).toBe(MAX_PLAYERS_PER_SYNC)
    // The two most recently tried are left for the next run
    expect(await untried()).toEqual(['P2', 'P3'])
  })
})
