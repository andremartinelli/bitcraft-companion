import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// The cookies the route sets
const jar = vi.hoisted(() => new Map<string, string>())
vi.mock('next/headers', () => ({
  cookies: async () => ({ set: (name: string, value: string) => jar.set(name, value) }),
}))

import { NextRequest } from 'next/server'
import { GET } from '@/app/preview_session/route'
import { db } from '@/lib/db'
import { PREVIEW_EMAIL } from '@/lib/preview'
import { readSessionToken, SESSION_COOKIE } from '@/services/auth/session_token'
import type { InventorySource, PlayerInfo } from '@/services/game_sync/inventory_source'
import {
  playerNames,
  PREVIEW_GROUP,
  preparePreviewAccount,
} from '@/services/preview/preview_account'
import { importTables, withSetsAndTools } from '../../helpers/game_data'

/** What a route handler threw: Next's 404 or redirect */
async function thrown(response: Promise<unknown>) {
  const error = await response.then(
    () => null,
    (e: unknown) => e
  )
  return String((error as { digest?: string } | null)?.digest ?? error)
}

const visit = (path: string) => thrown(GET(new NextRequest(`http://localhost:3100${path}`)))

const PLAYERS: Record<string, PlayerInfo> = {
  catarrose: { entityId: '101', username: 'Catarrose', regionId: 1, claims: [] },
  veeto: { entityId: '102', username: 'Veeto', regionId: 1, claims: [] },
}
const source = {
  name: 'fake',
  findPlayer: async (name: string) => PLAYERS[name.toLowerCase()] ?? null,
} as InventorySource

beforeEach(() => {
  jar.clear()
  process.env.SESSION_SECRET = 'a-test-secret-that-is-long-enough-123456'
})
afterEach(() => vi.unstubAllEnvs())

describe('/preview_session', () => {
  test('does not exist in production, in dev or in the tests', async () => {
    await preparePreviewAccount([], source)
    for (const env of ['production', 'development', '']) {
      vi.stubEnv('VERCEL_ENV', env)
      expect(await visit('/preview_session')).toMatch(/NEXT_HTTP_ERROR_FALLBACK;404/)
    }
    expect(jar.size).toBe(0)
  })

  test('in a preview, logs in as the test account and goes back', async () => {
    const { userId } = await preparePreviewAccount([], source)
    vi.stubEnv('VERCEL_ENV', 'preview')

    expect(await visit('/preview_session?next=/plans/3')).toMatch(
      /NEXT_REDIRECT;replace;\/plans\/3;/
    )
    expect(await readSessionToken(jar.get(SESSION_COOKIE))).toBe(userId)

    // Never to another site
    expect(await visit('/preview_session?next=//evil.com')).toMatch(/NEXT_REDIRECT;replace;\/;/)
  })

  test('a preview without the test account answers 404', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(await visit('/preview_session')).toMatch(/404/)
  })
})

describe('the test account', () => {
  beforeEach(() => importTables(withSetsAndTools()))

  test('its character, the others in its group, and the same plans after every build', async () => {
    expect(playerNames(' Catarrose, Veeto ,, ')).toEqual(['Catarrose', 'Veeto'])

    await preparePreviewAccount(['Catarrose', 'Veeto', 'Ninguem'], source)
    const { userId, warnings } = await preparePreviewAccount(['Catarrose', 'Veeto'], source)

    expect(warnings).toEqual([])
    const user = await db.user.findUniqueOrThrow({
      where: { email: PREVIEW_EMAIL },
      include: { gamePlayer: true },
    })
    expect(user.id).toBe(userId)
    expect(user.gamePlayer?.username).toBe('Catarrose')
    // One group, made again: the test account and Veeto's
    const group = await db.group.findFirstOrThrow({
      where: { ownerId: userId },
      include: { members: { include: { user: { include: { gamePlayer: true } } } } },
    })
    expect(group.name).toBe(PREVIEW_GROUP)
    expect(await db.group.count({ where: { ownerId: userId } })).toBe(1)
    expect(group.members.map((m) => m.user.gamePlayer?.username).sort()).toEqual([
      'Catarrose',
      'Veeto',
    ])
    const plans = await db.plan.findMany({
      where: { createdById: userId },
      orderBy: { id: 'asc' },
      include: { groupShares: true },
    })
    expect(plans.map((plan) => plan.name)).toEqual([
      'Set de couro T2',
      'Set de minério Plated T2',
      'Set de minério Duelist T2',
      expect.any(String),
    ])
    // Shared with the group: a plan shows both characters' inventory
    expect(plans.every((plan) => plan.groupShares[0]?.groupId === group.id)).toBe(true)
  })

  test('an unknown character is a warning, not an error', async () => {
    const { warnings } = await preparePreviewAccount(['Ninguem'], source)
    expect(warnings).toEqual(['Nenhum personagem chamado "Ninguem" na BitJita.'])
  })
})
