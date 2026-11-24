import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { FakeBitJita } from '../../helpers/bitjita'

const bitjita = vi.hoisted(() => ({ fake: null as FakeBitJita | null }))
vi.mock('@/services/game_sync/inventory_source', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/game_sync/inventory_source')>()
  const { bitjitaSource } = await import('../../helpers/bitjita')
  return { ...original, inventorySource: () => bitjitaSource(bitjita.fake!) }
})

import { GET } from '@/app/api/cron/inventory-sync/route'
import { db } from '@/lib/db'
import { fakeBitJita } from '../../helpers/bitjita'
import { importTables } from '../../helpers/game_data'
import { addBothPlayers } from '../../helpers/inventory'

const SECRET = 'a-cron-secret-for-the-tests-only'

const cron = (authorization?: string) =>
  GET(
    new Request('http://localhost/api/cron/inventory-sync', {
      headers: authorization ? { authorization } : {},
    })
  )

describe('the daily cron', () => {
  const saved = process.env.CRON_SECRET

  beforeEach(async () => {
    process.env.CRON_SECRET = SECRET
    bitjita.fake = fakeBitJita()
    await importTables()
    await addBothPlayers()
  })
  afterEach(() => {
    process.env.CRON_SECRET = saved
  })

  test('without the key, or with a wrong one, nothing runs', async () => {
    for (const header of [undefined, 'Bearer wrong', `Bearer ${SECRET}x`, SECRET]) {
      const response = await cron(header)
      expect(response.status).toBe(401)
    }
    process.env.CRON_SECRET = ''
    expect((await cron('Bearer ')).status).toBe(401)
    expect(bitjita.fake!.calls).toHaveLength(0)
  })

  test('with the key, syncs when the inventory is old', async () => {
    const response = await cron(`Bearer ${SECRET}`)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'ok', message: null })
    expect((await db.syncRun.findFirstOrThrow()).trigger).toBe('cron')
  })

  test('and does nothing when a sync ran recently', async () => {
    await cron(`Bearer ${SECRET}`)
    const calls = bitjita.fake!.calls.length

    const again = await cron(`Bearer ${SECRET}`)
    expect(await again.json()).toEqual({ status: 'skipped' })
    expect(bitjita.fake!.calls).toHaveLength(calls)
  })

  const runningSince = (secondsAgo: number) =>
    db.syncRun.create({
      data: {
        trigger: 'manual',
        source: 'bitjita',
        status: 'running',
        startedAt: new Date(Date.now() - secondsAgo * 1000),
      },
    })

  test('a sync started a moment ago, even one still running: nothing to do', async () => {
    await runningSince(10)

    const response = await cron(`Bearer ${SECRET}`)
    expect(await response.json()).toEqual({ status: 'skipped' })
  })

  test('an old one still running holds the lock: it says so', async () => {
    // Older than the 1 minute, younger than the 5 minutes that make it abandoned
    await runningSince(120)

    const response = await cron(`Bearer ${SECRET}`)
    expect(await response.json()).toEqual({ status: 'running' })
    expect(bitjita.fake!.calls).toHaveLength(0)
  })
})
