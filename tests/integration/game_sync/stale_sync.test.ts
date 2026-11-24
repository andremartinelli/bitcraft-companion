import { beforeEach, describe, expect, test } from 'vitest'
import type { SyncStatus } from '@/generated/prisma/client.ts'
import { db } from '@/lib/db'
import { inventoryFreshness, staleMinutes, syncIfStale } from '@/services/game_sync/stale_sync'
import { bitjitaSource, everyPathAnswers, fakeBitJita } from '../../helpers/bitjita'
import { importTables } from '../../helpers/game_data'
import { addBothPlayers } from '../../helpers/inventory'

const pastRun = (minutesAgo: number, status: SyncStatus = 'ok') =>
  db.syncRun.create({
    data: {
      trigger: 'manual',
      source: 'bitjita',
      status,
      startedAt: new Date(Date.now() - minutesAgo * 60_000),
      finishedAt: new Date(Date.now() - minutesAgo * 60_000),
    },
  })

describe('sync on demand and the daily cron', () => {
  beforeEach(() => importTables())

  test('does nothing without characters', async () => {
    const fake = fakeBitJita()

    expect(await inventoryFreshness(15)).toEqual({ hasPlayers: false, stale: false })
    expect(await syncIfStale(bitjitaSource(fake), 'cron', 15)).toBeNull()
    expect(fake.calls).toHaveLength(0)
    expect(await db.syncRun.count()).toBe(0)
  })

  test('the first sync: characters and no sync yet', async () => {
    await addBothPlayers()

    expect(await inventoryFreshness(15)).toEqual({ hasPlayers: true, stale: true })
    const run = await syncIfStale(bitjitaSource(), 'auto', 15)
    expect([run?.trigger, run?.status]).toEqual(['auto', 'ok'])
  })

  test('skips when a sync started recently (the button, another tab)', async () => {
    await addBothPlayers()
    await pastRun(3)
    const fake = fakeBitJita()

    expect(await syncIfStale(bitjitaSource(fake), 'auto', 15)).toBeNull()
    expect(fake.calls).toHaveLength(0)
  })

  test('a recent failure also counts: BitJita down is not asked again and again', async () => {
    await addBothPlayers()
    await pastRun(3, 'failed')

    expect((await inventoryFreshness(15)).stale).toBe(false)
  })

  test('syncs when the last sync is old enough', async () => {
    await addBothPlayers()
    await pastRun(20)

    const run = await syncIfStale(bitjitaSource(), 'cron', 15)

    expect([run?.trigger, run?.status]).toEqual(['cron', 'ok'])
  })

  test('then the history forgets runs older than 7 days, but not the last good one', async () => {
    await addBothPlayers()
    const lastGood = await pastRun(9 * 24 * 60)
    const failed = await pastRun(8 * 24 * 60, 'failed')
    const recent = await pastRun(6 * 24 * 60, 'failed')

    const run = await syncIfStale(
      bitjitaSource(fakeBitJita(everyPathAnswers({ status: 503 }))),
      'auto',
      15
    )

    const ids = (await db.syncRun.findMany({ orderBy: { id: 'asc' } })).map((r) => r.id)
    expect(ids).toEqual([lastGood.id, recent.id, run!.id])
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
