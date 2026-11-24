import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto'

/**
 * Password hashes with scrypt (node:crypto: nothing native to install on
 * Vercel), stored as "scrypt$N$r$p$salt$hash" so the cost can change later
 * without breaking the hashes already stored.
 */

const COST = { N: 2 ** 15, r: 8, p: 1 }
const KEY_LENGTH = 64
const SALT_BYTES = 16
// N = 2^15 with r = 8 takes 32 MiB, exactly Node's default limit
const MAX_MEMORY = 64 * 1024 * 1024

function scrypt(password: string, salt: Buffer, keyLength: number, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) =>
    scryptCallback(password, salt, keyLength, options, (error, key) =>
      error ? reject(error) : resolve(key)
    )
  )
}

export async function hashPassword(password: string) {
  const salt = randomBytes(SALT_BYTES)
  const key = await scrypt(password, salt, KEY_LENGTH, { ...COST, maxmem: MAX_MEMORY })
  return [
    'scrypt',
    COST.N,
    COST.r,
    COST.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$')
}

/** False for a wrong password and for a hash in an unknown format */
export async function verifyPassword(password: string, stored: string) {
  const [scheme, n, r, p, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64url')
  const cost = { N: Number(n), r: Number(r), p: Number(p) }
  if (!Object.values(cost).every((value) => Number.isInteger(value) && value > 0)) return false

  const key = await scrypt(password, Buffer.from(salt, 'base64url'), expected.length, {
    ...cost,
    maxmem: MAX_MEMORY,
  })
  return key.length === expected.length && timingSafeEqual(key, expected)
}

/**
 * Checked when the e-mail has no account, so a wrong e-mail takes as long
 * as a wrong password and does not reveal which accounts exist.
 */
export const DUMMY_HASH =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
