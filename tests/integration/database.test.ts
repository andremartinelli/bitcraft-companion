import { describe, expect, test } from 'vitest'
import { db } from '@/lib/db'

describe('database', () => {
  test('only one inventory sync can be running at a time', async () => {
    const running = { trigger: 'manual', source: 'bitjita', status: 'running' } as const
    await db.syncRun.create({ data: { ...running, startedAt: new Date() } })

    await expect(
      db.syncRun.create({ data: { ...running, startedAt: new Date() } })
    ).rejects.toThrow()

    // Finished runs do not count
    await db.syncRun.create({ data: { ...running, status: 'ok', startedAt: new Date() } })
    expect(await db.syncRun.count()).toBe(2)
  })

  test('each test starts with an empty database', async () => {
    expect(await db.syncRun.count()).toBe(0)
  })
})
