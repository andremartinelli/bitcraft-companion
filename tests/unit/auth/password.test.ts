import { describe, expect, test } from 'vitest'
import { DUMMY_HASH, hashPassword, verifyPassword } from '@/services/auth/password'

describe('passwords', () => {
  test('a hash checks the right password, never the wrong one', async () => {
    const hash = await hashPassword('correct horse battery')

    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$/)
    expect(await verifyPassword('correct horse battery', hash)).toBe(true)
    expect(await verifyPassword('correct horse batterY', hash)).toBe(false)
  })

  test('the same password hashes differently each time (salt)', async () => {
    const [a, b] = await Promise.all([hashPassword('same one here'), hashPassword('same one here')])
    expect(a).not.toBe(b)
  })

  test('a hash in another format is never a match', async () => {
    expect(await verifyPassword('anything', 'plain-text')).toBe(false)
    expect(await verifyPassword('anything', 'scrypt$x$8$1$abc$def')).toBe(false)
    // The Adonis app stored its own format: those accounts are created again
    expect(await verifyPassword('anything', '$scrypt$n=16384,r=8,p=1$abc$def')).toBe(false)
  })

  test('the hash for a missing account is valid and matches nothing', async () => {
    expect(await verifyPassword('', DUMMY_HASH)).toBe(false)
    expect(await verifyPassword('password', DUMMY_HASH)).toBe(false)
  })
})
