import { jwtVerify, SignJWT } from 'jose'

/**
 * The session is a signed token in a cookie: the user id and when it
 * expires. Signed with SESSION_SECRET (HS256); nothing secret inside.
 * jose runs in the proxy too.
 */

export const SESSION_COOKIE = 'session'
export const SESSION_DAYS = 30

const MIN_SECRET_LENGTH = 32

function secretKey(secret = process.env.SESSION_SECRET) {
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `SESSION_SECRET precisa ter pelo menos ${MIN_SECRET_LENGTH} caracteres (veja o .env.example).`
    )
  }
  return new TextEncoder().encode(secret)
}

interface TokenOptions {
  secret?: string
  now?: Date
}

export async function createSessionToken(userId: number, options: TokenOptions = {}) {
  const now = options.now ?? new Date()
  const issuedAt = Math.floor(now.getTime() / 1000)
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(userId))
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SESSION_DAYS * 24 * 3600)
    .sign(secretKey(options.secret))
}

/** The user id of a valid token; null when it is missing, expired, tampered with or malformed */
export async function readSessionToken(
  token: string | undefined | null,
  options: TokenOptions = {}
): Promise<number | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secretKey(options.secret), {
      algorithms: ['HS256'],
      currentDate: options.now,
    })
    const userId = Number(payload.sub)
    return Number.isInteger(userId) && userId > 0 ? userId : null
  } catch (error) {
    // A missing secret is a setup error, not a bad token
    if (error instanceof Error && error.message.startsWith('SESSION_SECRET')) throw error
    return null
  }
}
