import { describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import { CreateUserError, createUser } from '@/services/auth/create_user'
import { attemptLogin, LOCKOUT_MINUTES, MAX_FAILURES } from '@/services/auth/login'
import { verifyPassword } from '@/services/auth/password'

const password = 'a-long-enough-password'
const minutesLater = (start: Date, minutes: number) => new Date(start.getTime() + minutes * 60_000)

describe('accounts', () => {
  test('an account is created with a hash, never the password', async () => {
    const user = await createUser({ email: '  Andre@Example.com ', fullName: 'André', password })

    expect(user.email).toBe('andre@example.com')
    const stored = await db.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(stored.password).not.toContain(password)
    expect(await verifyPassword(password, stored.password)).toBe(true)
  })

  test('refuses a short password, a bad e-mail and an e-mail already used', async () => {
    await expect(createUser({ email: 'a@example.com', password: 'short' })).rejects.toThrow(
      /pelo menos 12/
    )
    await expect(createUser({ email: 'nope', password })).rejects.toThrow(/e-mail válido/)

    await createUser({ email: 'a@example.com', password })
    await expect(createUser({ email: 'A@example.com', password })).rejects.toThrow(CreateUserError)
    expect(await db.user.count()).toBe(1)
  })
})

describe('login', () => {
  test('the right password logs in; a wrong one or a wrong e-mail answer the same', async () => {
    const user = await createUser({ email: 'a@example.com', password })

    expect(await attemptLogin({ email: 'a@example.com', password })).toEqual({
      ok: true,
      user: { id: user.id, email: 'a@example.com', fullName: null },
    })
    expect(await attemptLogin({ email: 'a@example.com', password: 'wrong-password' })).toEqual({
      ok: false,
      reason: 'invalid',
    })
    expect(await attemptLogin({ email: 'b@example.com', password })).toEqual({
      ok: false,
      reason: 'invalid',
    })
    expect(await db.loginAttempt.count({ where: { succeeded: false } })).toBe(2)
  })

  test(`${MAX_FAILURES} wrong passwords lock the e-mail, even with the right one`, async () => {
    await createUser({ email: 'a@example.com', password })
    const start = new Date('2026-11-24T12:00:00Z')
    for (let i = 0; i < MAX_FAILURES; i++) {
      await attemptLogin({ email: 'a@example.com', password: 'wrong', now: minutesLater(start, 1) })
    }

    const locked = await attemptLogin({
      email: 'a@example.com',
      password,
      now: minutesLater(start, 2),
    })
    expect(locked).toEqual({ ok: false, reason: 'locked' })

    // The other account is not affected
    await createUser({ email: 'b@example.com', password })
    expect(
      (await attemptLogin({ email: 'b@example.com', password, now: minutesLater(start, 2) })).ok
    ).toBe(true)

    // Once the failures are older than the window, the right password works again
    const later = minutesLater(start, 2 + LOCKOUT_MINUTES + 1)
    expect((await attemptLogin({ email: 'a@example.com', password, now: later })).ok).toBe(true)
  })

  test('a login that works starts the count again', async () => {
    await createUser({ email: 'a@example.com', password })
    const start = new Date('2026-11-24T12:00:00Z')
    for (let i = 0; i < MAX_FAILURES - 1; i++) {
      await attemptLogin({ email: 'a@example.com', password: 'wrong', now: start })
    }
    await attemptLogin({ email: 'a@example.com', password, now: minutesLater(start, 1) })

    const typo = await attemptLogin({
      email: 'a@example.com',
      password: 'wrong',
      now: minutesLater(start, 2),
    })
    expect(typo).toEqual({ ok: false, reason: 'invalid' })
    expect(
      (await attemptLogin({ email: 'a@example.com', password, now: minutesLater(start, 3) })).ok
    ).toBe(true)
  })
})
