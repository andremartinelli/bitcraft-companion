import { beforeEach, describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import {
  CRON_MAX_PLAYERS,
  cronSync,
  inventoryFreshness,
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

describe('sync on demand, per account', () => {
  beforeEach(() => importTables())

  test('an account without characters has nothing to read', async () => {
    const user = await db.user.create({ data: { email: 'a@example.com', password: '-' } })
    const fake = fakeBitJita()

    expect(await inventoryFreshness(user.id, 15)).toEqual({ hasPlayers: false, stale: false })
    expect(await syncIfStale(bitjitaSource(fake), user.id, 15)).toBeNull()
    expect(fake.calls).toHaveLength(0)
    expect(await db.syncRun.count()).toBe(0)
  })

  test('characters never tried: the first sync, for this account', async () => {
    const { userId } = await addBothPlayers()

    expect(await inventoryFreshness(userId, 15)).toEqual({ hasPlayers: true, stale: true })
    const run = await syncIfStale(bitjitaSource(), userId, 15)
    expect([run?.trigger, run?.status, run?.userId]).toEqual(['auto', 'ok', userId])
  })

  test('only the characters that are old are read again', async () => {
    const { userId } = await addBothPlayers()
    await tried(PLAYER_ONE.entityId, 3)
    const fake = fakeBitJita()

    await syncIfStale(bitjitaSource(fake), userId, 15)

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

    expect((await inventoryFreshness(userId, 15)).stale).toBe(false)
    expect(await syncIfStale(bitjitaSource(fake), userId, 15)).toBeNull()
    expect(fake.calls).toHaveLength(0)
  })

  test("another account's characters are not read", async () => {
    await addBothPlayers()
    const other = await db.user.create({ data: { email: 'b@example.com', password: '-' } })

    expect(await syncIfStale(bitjitaSource(), other.id, 15)).toBeNull()
  })

  test("then the history forgets runs older than 7 days, but not each account's last good one", async () => {
    const { userId } = await addBothPlayers()
    const lastGood = await pastRun(9, 'ok', userId)
    const failed = await pastRun(8, 'failed', userId)
    const cronGood = await pastRun(10, 'ok', null)
    const recent = await pastRun(6, 'failed', userId)

    const run = await syncIfStale(
      bitjitaSource(fakeBitJita(everyPathAnswers({ status: 503 }))),
      userId,
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

  test('reads the followed characters nobody looked at in the last hour', async () => {
    await addBothPlayers()
    await tried(PLAYER_ONE.entityId, 30)
    const fake = fakeBitJita()

    const run = await cronSync(bitjitaSource(fake))

    expect([run?.trigger, run?.userId, run?.status]).toEqual(['cron', null, 'ok'])
    expect(fake.calls.some((call) => call.path.includes(PLAYER_ONE.entityId))).toBe(false)
  })

  test('nobody follows them, or all were read recently: nothing to do', async () => {
    const { playerIds } = await addBothPlayers()
    await db.gamePlayer.updateMany({
      where: { id: { in: playerIds } },
      data: { lastAttemptAt: minutesAgo(10) },
    })
    expect(await cronSync(bitjitaSource())).toBeNull()

    await db.userGamePlayer.deleteMany()
    await db.gamePlayer.updateMany({ data: { lastAttemptAt: null } })
    expect(await cronSync(bitjitaSource())).toBeNull()
  })

  test(`at most ${CRON_MAX_PLAYERS} characters, the oldest first`, async () => {
    const user = await db.user.create({ data: { email: 'c@example.com', password: '-' } })
    for (let i = 0; i < CRON_MAX_PLAYERS + 2; i++) {
      await db.gamePlayer.create({
        data: {
          username: `P${i}`,
          entityId: `90000000000000${String(i).padStart(4, '0')}`,
          lastAttemptAt: i < 2 ? null : minutesAgo(120 + i),
          followers: { create: { userId: user.id } },
        },
      })
    }

    // Every read fails (unknown ids): the count of characters is what matters
    const run = await cronSync(bitjitaSource(fakeBitJita({})))

    expect((run!.counts as { playersTotal: number }).playersTotal).toBe(CRON_MAX_PLAYERS)
    const untried = await db.gamePlayer.findMany({
      where: { lastAttemptAt: { lt: minutesAgo(60) } },
      select: { username: true },
    })
    // The two most recently tried are left for the next run
    expect(untried.map((p) => p.username).sort()).toEqual(['P2', 'P3'])
  })
})
