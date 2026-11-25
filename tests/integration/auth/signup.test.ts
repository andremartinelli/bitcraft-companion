import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { FakeBitJita } from '../../helpers/bitjita'

// The request's IP and cookies, as the sign-up action reads them, and the BitJita it asks the nick
const request = vi.hoisted(() => ({
  ip: '203.0.113.7' as string | null,
  cookies: new Map<string, string>(),
  bitjita: null as FakeBitJita | null,
}))
vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers(request.ip ? { 'x-forwarded-for': `${request.ip}, 10.0.0.1` } : {}),
  cookies: async () => ({
    get: (name: string) =>
      request.cookies.has(name) ? { value: request.cookies.get(name) } : undefined,
    set: (name: string, value: string) => request.cookies.set(name, value),
    delete: (name: string) => request.cookies.delete(name),
  }),
}))

vi.mock('@/services/game_sync/inventory_source', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/game_sync/inventory_source')>()
  const { bitjitaSource } = await import('../../helpers/bitjita')
  return { ...original, inventorySource: () => bitjitaSource(request.bitjita!) }
})

import { createAccount } from '@/app/signup/actions'
import { db } from '@/lib/db'
import { verifyPassword } from '@/services/auth/password'
import { readSessionToken, SESSION_COOKIE } from '@/services/auth/session_token'
import { MAX_SIGNUPS_PER_IP, signUp } from '@/services/auth/signup'
import { signupSchema } from '@/validators/user'
import { fakeBitJita, PLAYER_ONE, recordedResponses } from '../../helpers/bitjita'
import { importTables } from '../../helpers/game_data'

const EMPTY = { error: null, fullName: '', email: '', gamePlayerUsername: '' }

const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

const valid = {
  fullName: 'Vitor',
  email: 'Vitor@Example.com',
  password: 'oito8888',
  passwordConfirmation: 'oito8888',
}

/** Where an action sent the browser (it throws Next's redirect) */
async function redirectedTo(action: Promise<unknown>) {
  const error = await action.then(
    () => null,
    (e: unknown) => e
  )
  const digest = String((error as { digest?: string } | null)?.digest ?? '')
  if (!digest.startsWith('NEXT_REDIRECT')) throw new Error(`no redirect: ${String(error)}`)
  return digest.split(';')[2]
}

describe('sign-up', () => {
  beforeEach(() => {
    request.ip = '203.0.113.7'
    request.cookies.clear()
    request.bitjita = fakeBitJita()
  })

  test('anyone creates an account, starts logged in and goes to the plans', async () => {
    expect(await redirectedTo(createAccount(EMPTY, form(valid)))).toBe('/plans')

    const user = await db.user.findUniqueOrThrow({ where: { email: 'vitor@example.com' } })
    expect([user.fullName, user.signupIp]).toEqual(['Vitor', '203.0.113.7'])
    expect(await verifyPassword('oito8888', user.password)).toBe(true)
    expect(await readSessionToken(request.cookies.get(SESSION_COOKIE))).toBe(user.id)
    // No nick: no character, and BitJita is not asked
    expect(user.gamePlayerId).toBeNull()
    expect(request.bitjita!.calls).toHaveLength(0)
  })

  describe("with the character's nick", () => {
    beforeEach(() => importTables())

    test('BitJita finds it: the account starts with it and keeps the way back to the invite', async () => {
      const next = '/invites/abc'
      expect(
        await redirectedTo(
          createAccount(EMPTY, form({ ...valid, gamePlayerUsername: ' Nimbus ', next }))
        )
      ).toBe(next)

      const user = await db.user.findUniqueOrThrow({
        where: { email: 'vitor@example.com' },
        select: { gamePlayer: { select: { username: true, entityId: true } } },
      })
      expect(user.gamePlayer).toEqual(PLAYER_ONE)
    })

    test('a nick BitJita does not know: no account, and what was typed comes back', async () => {
      const responses = recordedResponses()
      responses['/api/players?q=Ninguem'] = { body: { players: [], total: 0 } }
      request.bitjita = fakeBitJita(responses)

      expect(await createAccount(EMPTY, form({ ...valid, gamePlayerUsername: 'Ninguem' }))).toEqual(
        {
          error: 'Nenhum personagem chamado "Ninguem" na BitJita.',
          fullName: 'Vitor',
          email: 'Vitor@Example.com',
          gamePlayerUsername: 'Ninguem',
        }
      )
      expect(await db.user.count()).toBe(0)
      expect(request.cookies.size).toBe(0)

      // Erasing the nick creates the account, without a character
      await redirectedTo(createAccount(EMPTY, form({ ...valid, gamePlayerUsername: '  ' })))
      expect((await db.user.findFirstOrThrow()).gamePlayerId).toBeNull()
    })

    test('BitJita down: no account, and the form says so', async () => {
      request.bitjita = fakeBitJita({ '/api/players?q=Nimbus': { status: 503, body: {} } })

      const result = await createAccount(EMPTY, form({ ...valid, gamePlayerUsername: 'Nimbus' }))
      expect(result.error).toContain('Não foi possível consultar a BitJita agora')
      expect(result.gamePlayerUsername).toBe('Nimbus')
      expect(await db.user.count()).toBe(0)
    })

    test('a used e-mail says so before BitJita is asked', async () => {
      await redirectedTo(createAccount(EMPTY, form(valid)))

      expect(
        (await createAccount(EMPTY, form({ ...valid, gamePlayerUsername: 'Nimbus' }))).error
      ).toBe('Já existe uma conta com o e-mail vitor@example.com.')
      expect(request.bitjita!.calls).toHaveLength(0)
    })

    test('the IP limit comes first: BitJita is not asked', async () => {
      for (let i = 0; i < MAX_SIGNUPS_PER_IP; i++) {
        await signUp({
          email: `p${i}@example.com`,
          fullName: 'P',
          password: 'oito8888',
          ip: '198.51.100.9',
        })
      }

      const result = await signUp({
        email: 'x@example.com',
        fullName: 'X',
        password: 'oito8888',
        gamePlayerUsername: 'Nimbus',
        ip: '198.51.100.9',
      })
      expect(result.ok).toBe(false)
      expect(request.bitjita!.calls).toHaveLength(0)
    })
  })

  test('8 characters are enough; fewer, a mismatch or a used e-mail are refused', async () => {
    expect(
      await createAccount(
        EMPTY,
        form({ ...valid, password: 'sete777', passwordConfirmation: 'sete777' })
      )
    ).toEqual({
      error: 'A senha precisa ter pelo menos 8 caracteres.',
      fullName: 'Vitor',
      email: 'Vitor@Example.com',
      gamePlayerUsername: '',
    })
    expect(
      (await createAccount(EMPTY, form({ ...valid, passwordConfirmation: 'outra888' }))).error
    ).toBe('As senhas não conferem.')
    expect((await createAccount(EMPTY, form({ ...valid, fullName: ' ' }))).error).toBe(
      'Informe o seu nome.'
    )

    await redirectedTo(createAccount(EMPTY, form(valid)))
    expect((await createAccount(EMPTY, form(valid))).error).toBe(
      'Já existe uma conta com o e-mail vitor@example.com.'
    )
    expect(request.cookies.size).toBe(1)
    expect(await db.user.count()).toBe(1)
  })

  test(`at most ${MAX_SIGNUPS_PER_IP} new accounts a day from one IP`, async () => {
    for (let i = 0; i < MAX_SIGNUPS_PER_IP; i++) {
      const result = await signUp({
        email: `p${i}@example.com`,
        fullName: `P${i}`,
        password: 'oito8888',
        ip: '198.51.100.9',
      })
      expect(result.ok).toBe(true)
    }

    expect(
      await signUp({
        email: 'x@example.com',
        fullName: 'X',
        password: 'oito8888',
        ip: '198.51.100.9',
      })
    ).toEqual({ ok: false, error: 'Muitas contas novas criadas daqui hoje. Tente de novo amanhã.' })
    // Another IP, or one from yesterday, is fine
    expect(
      (
        await signUp({
          email: 'y@example.com',
          fullName: 'Y',
          password: 'oito8888',
          ip: '198.51.100.10',
        })
      ).ok
    ).toBe(true)
    const tomorrow = new Date(Date.now() + 25 * 3_600_000)
    expect(
      (
        await signUp({
          email: 'z@example.com',
          fullName: 'Z',
          password: 'oito8888',
          ip: '198.51.100.9',
          now: tomorrow,
        })
      ).ok
    ).toBe(true)
  })

  test('the schema says what is wrong', () => {
    expect(signupSchema.safeParse(valid).success).toBe(true)
    expect(signupSchema.safeParse({ ...valid, email: 'nope' }).error?.issues[0].message).toBe(
      'Informe um e-mail válido.'
    )
  })
})
