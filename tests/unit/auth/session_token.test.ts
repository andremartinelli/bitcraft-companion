import { describe, expect, test } from 'vitest'
import { createSessionToken, readSessionToken, SESSION_DAYS } from '@/services/auth/session_token'

const secret = 'a-test-secret-that-is-long-enough-123456'
const now = new Date('2026-11-24T12:00:00Z')
const daysLater = (days: number) => new Date(now.getTime() + days * 24 * 3600 * 1000)

describe('session token', () => {
  test('carries the user id while it is valid', async () => {
    const token = await createSessionToken(7, { secret, now })

    expect(await readSessionToken(token, { secret, now })).toBe(7)
    expect(await readSessionToken(token, { secret, now: daysLater(SESSION_DAYS - 1) })).toBe(7)
  })

  test('expires after 30 days', async () => {
    const token = await createSessionToken(7, { secret, now })
    expect(await readSessionToken(token, { secret, now: daysLater(SESSION_DAYS + 1) })).toBeNull()
  })

  test('a token signed with another secret, or changed, is refused', async () => {
    const token = await createSessionToken(7, { secret, now })
    const other = `${secret}-other`
    expect(await readSessionToken(token, { secret: other, now })).toBeNull()

    const [header, , signature] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ sub: '1', exp: 9_999_999_999 })).toString(
      'base64url'
    )
    expect(await readSessionToken(`${header}.${forged}.${signature}`, { secret, now })).toBeNull()
    expect(await readSessionToken('not-a-token', { secret, now })).toBeNull()
    expect(await readSessionToken(undefined, { secret, now })).toBeNull()
  })

  test('a short or missing secret is a setup error', async () => {
    await expect(createSessionToken(7, { secret: 'short' })).rejects.toThrow(/SESSION_SECRET/)
    await expect(readSessionToken('a.b.c', { secret: 'short' })).rejects.toThrow(/SESSION_SECRET/)
  })
})
