import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { FakeBitJita } from '../../helpers/bitjita'

// The BitJita the route reads
const bitjita = vi.hoisted(() => ({ fake: null as FakeBitJita | null }))
vi.mock('@/services/game_sync/inventory_source', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/game_sync/inventory_source')>()
  const { bitjitaSource } = await import('../../helpers/bitjita')
  return { ...original, inventorySource: () => bitjitaSource(bitjita.fake!) }
})

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/inventory/sync/route'
import { db } from '@/lib/db'
import { insertPlan } from '@/models/plan'
import { saveOnlyMyInventory } from '@/models/plan_user_setting'
import { createUser } from '@/services/auth/create_user'
import { createSessionToken } from '@/services/auth/session_token'
import { emptyState } from '@/services/calculator/state_params'
import { everyPathAnswers, fakeBitJita, PLAYER_ONE, PLAYER_TWO } from '../../helpers/bitjita'
import { importTables } from '../../helpers/game_data'
import { addBothPlayers, syncBothPlayers } from '../../helpers/inventory'

describe('POST /api/inventory/sync', () => {
  let userId: number
  let token: string | null

  beforeEach(async () => {
    await importTables()
    const user = await createUser({
      email: 'vitor@example.com',
      password: 'a-long-enough-password',
    })
    userId = user.id
    token = await createSessionToken(user.id)
    bitjita.fake = fakeBitJita()
  })

  const sync = async (body: unknown = {}) => {
    const response = await POST(
      new NextRequest('http://localhost/api/inventory/sync', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token && { cookie: `session=${token}` }),
        },
        body: JSON.stringify(body),
      })
    )
    return { status: response.status, body: await response.json() }
  }
  const syncNow = async () => (await sync()).body
  const syncIfStale = async () => (await sync({ onlyIfStale: true })).body
  const read = (entityId: string) =>
    bitjita.fake!.calls.some((call) => call.path.includes(entityId))

  test('asks for the login first', async () => {
    token = null
    await addBothPlayers(userId)

    expect((await sync()).status).toBe(401)
    expect((await sync({ onlyIfStale: true })).status).toBe(401)
    expect(bitjita.fake!.calls).toHaveLength(0)
  })

  test('refuses what is not a sync request', async () => {
    expect((await sync({ onlyIfStale: 'yes' })).status).toBe(400)
    expect(bitjita.fake!.calls).toHaveLength(0)
  })

  test('"Sincronizar agora" reads my character, without the claim chests', async () => {
    await addBothPlayers(userId)

    expect(await syncNow()).toEqual({ refresh: true, notice: 'Sincronização concluída.', ok: true })
    expect([read(PLAYER_ONE.entityId), read(PLAYER_TWO.entityId)]).toEqual([true, false])
    expect(bitjita.fake!.calls.some((call) => call.path.startsWith('/api/claims/'))).toBe(false)
    const run = await db.syncRun.findFirstOrThrow()
    expect([run.trigger, run.userId]).toEqual(['manual', userId])
  })

  test('in a plan: also the characters of the people it is shared with', async () => {
    const { partnerId } = await addBothPlayers(userId)
    const plan = await insertPlan({ name: 'Juntos', state: emptyState(), userId: partnerId })
    await db.planShare.create({ data: { planId: plan.id, userId } })

    expect((await sync({ planId: plan.id })).body.ok).toBe(true)
    expect([read(PLAYER_ONE.entityId), read(PLAYER_TWO.entityId)]).toEqual([true, true])

    // "Usar apenas meu inventário": only mine
    await saveOnlyMyInventory(plan.id, userId, true)
    bitjita.fake = fakeBitJita()
    await sync({ planId: plan.id })
    expect([read(PLAYER_ONE.entityId), read(PLAYER_TWO.entityId)]).toEqual([true, false])
  })

  test("a plan I can't open is not found, and nothing is read", async () => {
    const { partnerId } = await addBothPlayers(userId)
    const plan = await insertPlan({ name: 'Dele', state: emptyState(), userId: partnerId })

    expect((await sync({ planId: plan.id })).status).toBe(404)
    expect((await sync({ planId: plan.id, onlyIfStale: true })).status).toBe(404)
    expect(bitjita.fake!.calls).toHaveLength(0)
  })

  test("another account's characters are not mine to read", async () => {
    await addBothPlayers()

    expect((await syncNow()).ok).toBe(false)
    expect(bitjita.fake!.calls).toHaveLength(0)
  })

  test('also when the last sync is recent', async () => {
    await syncBothPlayers(userId)

    expect((await syncNow()).ok).toBe(true)
    expect(await db.syncRun.count()).toBe(2)
  })

  test('a failed sync keeps the data and says so', async () => {
    await syncBothPlayers(userId)
    bitjita.fake = fakeBitJita(everyPathAnswers({ status: 503, body: {} }))

    expect(await syncNow()).toEqual({
      refresh: true,
      notice: 'A sincronização falhou. Os dados anteriores foram mantidos.',
      ok: false,
    })
    expect(await db.inventoryEntry.count()).toBeGreaterThan(0)
  })

  test('a sync while another one runs does not run', async () => {
    await addBothPlayers(userId)
    await db.syncRun.create({
      data: { trigger: 'auto', source: 'bitjita', status: 'running', startedAt: new Date() },
    })

    expect(await syncNow()).toEqual({
      refresh: false,
      notice: 'Já existe uma sincronização em andamento.',
      ok: false,
    })
    expect(await syncIfStale()).toEqual({ refresh: false, notice: null, ok: false })
    expect(bitjita.fake!.calls).toHaveLength(0)
  })

  test('the page found the inventory old: it syncs once, then it is fresh', async () => {
    await addBothPlayers(userId)

    expect(await syncIfStale()).toEqual({ refresh: true, notice: null, ok: true })
    expect((await db.syncRun.findFirstOrThrow()).trigger).toBe('auto')

    // A second tab asking right after: nothing to do
    expect(await syncIfStale()).toEqual({ refresh: false, notice: null, ok: false })
    expect(await db.syncRun.count()).toBe(1)
  })
})
