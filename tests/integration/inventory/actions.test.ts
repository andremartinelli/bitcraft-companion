import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { FakeBitJita } from '../../helpers/bitjita'

// The session cookie, the page refresh after a change, and the BitJita the actions read
const request = vi.hoisted(() => ({
  token: undefined as string | undefined,
  bitjita: null as FakeBitJita | null,
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'session' && request.token ? { value: request.token } : undefined,
  }),
}))
vi.mock('next/cache', () => ({ refresh: vi.fn() }))
vi.mock('@/services/game_sync/inventory_source', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/game_sync/inventory_source')>()
  const { bitjitaSource } = await import('../../helpers/bitjita')
  return { ...original, inventorySource: () => bitjitaSource(request.bitjita!) }
})

import { refresh } from 'next/cache'
import { addGamePlayer, removeGamePlayer } from '@/app/(app)/game_players/actions'
import { syncIfStale, syncNow } from '@/app/(app)/inventory/actions'
import { db } from '@/lib/db'
import { createUser } from '@/services/auth/create_user'
import { createSessionToken } from '@/services/auth/session_token'
import {
  bitjitaFixture,
  CLAIM,
  everyPathAnswers,
  fakeBitJita,
  PLAYER_ONE,
  PLAYER_TWO,
  recordedResponses,
} from '../../helpers/bitjita'
import { importTables } from '../../helpers/game_data'
import { addBothPlayers, syncBothPlayers } from '../../helpers/inventory'

const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

const EMPTY = { error: null, notice: null, username: '' }

describe('inventory actions', () => {
  beforeEach(async () => {
    await importTables()
    const user = await createUser({
      email: 'vitor@example.com',
      password: 'a-long-enough-password',
    })
    request.token = await createSessionToken(user.id)
    request.bitjita = fakeBitJita()
    vi.mocked(refresh).mockClear()
  })

  test('every action asks for the login first', async () => {
    request.token = undefined
    const login = expect.objectContaining({ digest: expect.stringContaining(';/login;') })

    await expect(syncNow()).rejects.toEqual(login)
    await expect(syncIfStale()).rejects.toEqual(login)
    await expect(addGamePlayer(EMPTY, form({ username: 'Nimbus' }))).rejects.toEqual(login)
    await expect(removeGamePlayer(1)).rejects.toEqual(login)
    expect(request.bitjita!.calls).toHaveLength(0)
  })

  test('"Sincronizar agora" reads BitJita, without the claim chests, and refreshes', async () => {
    await addBothPlayers()

    expect(await syncNow()).toEqual({ notice: 'Sincronização concluída.', ok: true })
    expect(request.bitjita!.calls.some((call) => call.path.startsWith('/api/claims/'))).toBe(false)
    expect(refresh).toHaveBeenCalledOnce()
    expect((await db.syncRun.findFirstOrThrow()).trigger).toBe('manual')
  })

  test('also when the last sync is recent', async () => {
    await syncBothPlayers()

    expect((await syncNow()).ok).toBe(true)
    expect(await db.syncRun.count()).toBe(2)
  })

  test('a failed sync keeps the data and says so', async () => {
    await syncBothPlayers()
    request.bitjita = fakeBitJita(everyPathAnswers({ status: 503, body: {} }))

    expect(await syncNow()).toEqual({
      notice: 'A sincronização falhou. Os dados anteriores foram mantidos.',
      ok: false,
    })
    expect(await db.inventoryEntry.count()).toBeGreaterThan(0)
  })

  test('a sync while another one runs does not run', async () => {
    await addBothPlayers()
    await db.syncRun.create({
      data: { trigger: 'auto', source: 'bitjita', status: 'running', startedAt: new Date() },
    })

    expect(await syncNow()).toEqual({
      notice: 'Já existe uma sincronização em andamento.',
      ok: false,
    })
    expect(await syncIfStale()).toEqual({ synced: false })
    expect(request.bitjita!.calls).toHaveLength(0)
  })

  test('the page found the inventory old: it syncs once, then it is fresh', async () => {
    await addBothPlayers()

    expect(await syncIfStale()).toEqual({ synced: true })
    expect(refresh).toHaveBeenCalledOnce()
    expect((await db.syncRun.findFirstOrThrow()).trigger).toBe('auto')

    // A second tab asking right after: nothing to do
    expect(await syncIfStale()).toEqual({ synced: false })
    expect(await db.syncRun.count()).toBe(1)
  })

  test('adds a character after finding the exact nick on BitJita', async () => {
    const responses = recordedResponses()
    responses['/api/players?q=nimbus'] = { body: bitjitaFixture('players_search') }
    request.bitjita = fakeBitJita(responses)

    expect(await addGamePlayer(EMPTY, form({ username: ' nimbus ' }))).toEqual({
      error: null,
      notice: 'Nimbus adicionado. Sincronize o inventário para ver os itens.',
      username: '',
    })
    const player = await db.gamePlayer.findUniqueOrThrow({
      where: { entityId: PLAYER_ONE.entityId },
    })
    expect([player.username, player.regionId, player.claims]).toEqual([
      'Nimbus',
      14,
      [{ entityId: CLAIM.entityId, name: CLAIM.name }],
    ])
  })

  test('refuses a nick BitJita does not know, a blank one and one already there', async () => {
    const responses = recordedResponses()
    responses['/api/players?q=Ninguem'] = { body: { players: [], total: 0 } }
    request.bitjita = fakeBitJita(responses)

    expect((await addGamePlayer(EMPTY, form({ username: 'Ninguem' }))).error).toBe(
      'Nenhum personagem chamado "Ninguem" na BitJita.'
    )
    expect((await addGamePlayer(EMPTY, form({ username: '  ' }))).error).toBe(
      'Informe o nick do personagem.'
    )
    await db.gamePlayer.create({ data: PLAYER_ONE })
    expect(await addGamePlayer(EMPTY, form({ username: 'Nimbus' }))).toEqual({
      error: 'Nimbus já está na lista.',
      notice: null,
      username: 'Nimbus',
    })
    expect(await db.gamePlayer.count()).toBe(1)
  })

  test('BitJita down: nothing is saved and the page says so', async () => {
    request.bitjita = fakeBitJita({ '/api/players?q=Nimbus': { status: 503, body: {} } })

    const result = await addGamePlayer(EMPTY, form({ username: 'Nimbus' }))
    expect(result.error).toContain('Não foi possível consultar a BitJita agora')
    expect(await db.gamePlayer.count()).toBe(0)
  })

  test('removing a character takes its inventory away, not the others', async () => {
    await syncBothPlayers()
    const one = await db.gamePlayer.findUniqueOrThrow({ where: { entityId: PLAYER_ONE.entityId } })
    const two = await db.gamePlayer.findUniqueOrThrow({ where: { entityId: PLAYER_TWO.entityId } })

    expect(await removeGamePlayer(one.id)).toEqual({ notice: 'Nimbus removido do inventário.' })
    expect(await db.inventoryContainer.count({ where: { gamePlayerId: one.id } })).toBe(0)
    expect(await db.inventoryContainer.count({ where: { gamePlayerId: two.id } })).toBeGreaterThan(
      0
    )
    expect(await removeGamePlayer(one.id)).toEqual({
      notice: 'Esse personagem já tinha sido removido.',
    })
  })
})
