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
import { createGamePlayer, destroyGamePlayer } from '@/app/(app)/game_player/actions'
import { db } from '@/lib/db'
import { claimGamePlayer } from '@/models/game_player'
import { createUser } from '@/services/auth/create_user'
import { createSessionToken } from '@/services/auth/session_token'
import {
  bitjitaFixture,
  CLAIM,
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

describe('Meu personagem (game_player actions)', () => {
  let userId: number

  beforeEach(async () => {
    await importTables()
    const user = await createUser({
      email: 'vitor@example.com',
      password: 'a-long-enough-password',
    })
    userId = user.id
    request.token = await createSessionToken(user.id)
    request.bitjita = fakeBitJita()
    vi.mocked(refresh).mockClear()
  })

  test('every action asks for the login first', async () => {
    request.token = undefined
    const login = expect.objectContaining({ digest: expect.stringContaining(';/login;') })

    await expect(createGamePlayer(EMPTY, form({ username: 'Nimbus' }))).rejects.toEqual(login)
    await expect(destroyGamePlayer()).rejects.toEqual(login)
    expect(request.bitjita!.calls).toHaveLength(0)
  })

  const mine = async (id = userId) =>
    (await db.user.findUniqueOrThrow({ where: { id }, select: { gamePlayerId: true } }))
      .gamePlayerId

  test("the account's character, after finding the exact nick on BitJita", async () => {
    const responses = recordedResponses()
    responses['/api/players?q=nimbus'] = { body: bitjitaFixture('players_search') }
    request.bitjita = fakeBitJita(responses)

    expect(await createGamePlayer(EMPTY, form({ username: ' nimbus ' }))).toEqual({
      error: null,
      notice: 'Nimbus é o seu personagem. Sincronize o inventário para ver os itens.',
      username: '',
    })
    const player = await db.gamePlayer.findUniqueOrThrow({ where: { entityId: PLAYER_ONE.entityId } })
    expect([player.username, player.regionId, player.claims]).toEqual([
      'Nimbus',
      14,
      [{ entityId: CLAIM.entityId, name: CLAIM.name }],
    ])
    expect(await mine()).toBe(player.id)
    expect(vi.mocked(refresh)).toHaveBeenCalled()
  })

  test('a character another account has is the same one, not a copy', async () => {
    const { userId: otherId, playerIds } = await addBothPlayers()

    expect((await createGamePlayer(EMPTY, form({ username: 'Nimbus' }))).error).toBeNull()
    expect(await db.gamePlayer.count({ where: { entityId: PLAYER_ONE.entityId } })).toBe(1)
    expect([await mine(), await mine(otherId)]).toEqual([playerIds[0], playerIds[0]])
  })

  test('another character takes its place; the old one goes when nobody has it', async () => {
    const one = await claimGamePlayer(userId, { ...PLAYER_ONE, regionId: 1, claims: [] })
    const two = await claimGamePlayer(userId, { ...PLAYER_TWO, regionId: 1, claims: [] })

    expect(await mine()).toBe(two.id)
    expect(await db.gamePlayer.count({ where: { id: one.id } })).toBe(0)
  })

  test('refuses a nick BitJita does not know and a blank one', async () => {
    const responses = recordedResponses()
    responses['/api/players?q=Ninguem'] = { body: { players: [], total: 0 } }
    request.bitjita = fakeBitJita(responses)

    expect((await createGamePlayer(EMPTY, form({ username: 'Ninguem' }))).error).toBe(
      'Nenhum personagem chamado "Ninguem" na BitJita.'
    )
    expect(await createGamePlayer(EMPTY, form({ username: '  ' }))).toEqual({
      error: 'Informe o nick do personagem.',
      notice: null,
      username: '  ',
    })
    expect(await db.gamePlayer.count()).toBe(0)
  })

  test('BitJita down: nothing is saved and the page says so', async () => {
    request.bitjita = fakeBitJita({ '/api/players?q=Nimbus': { status: 503, body: {} } })

    const result = await createGamePlayer(EMPTY, form({ username: 'Nimbus' }))
    expect(result.error).toContain('Não foi possível consultar a BitJita agora')
    expect(await db.gamePlayer.count()).toBe(0)
  })

  test('removing my character nobody else has takes its inventory away, not the others', async () => {
    const { playerIds } = await syncBothPlayers(userId)
    const [one, two] = playerIds

    expect(await destroyGamePlayer()).toEqual({ notice: 'Nimbus removido do seu inventário.' })
    expect(await mine()).toBeNull()
    expect(await db.gamePlayer.count({ where: { id: one } })).toBe(0)
    expect(await db.inventoryContainer.count({ where: { gamePlayerId: one } })).toBe(0)
    expect(await db.inventoryContainer.count({ where: { gamePlayerId: two } })).toBeGreaterThan(0)
    expect(await destroyGamePlayer()).toEqual({ notice: 'Você já não tinha personagem.' })
  })

  test('a character another account still has stays, for that account', async () => {
    const { playerIds } = await syncBothPlayers(userId)
    await db.user.create({
      data: { email: 'b@example.com', password: '-', gamePlayerId: playerIds[0] },
    })

    await destroyGamePlayer()

    expect(
      await db.inventoryContainer.count({ where: { gamePlayerId: playerIds[0] } })
    ).toBeGreaterThan(0)
  })
})
