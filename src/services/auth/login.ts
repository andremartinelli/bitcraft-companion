import { db } from '@/lib/db'
import { DUMMY_HASH, verifyPassword } from '@/services/auth/password'

/** After this many wrong passwords for one e-mail... */
export const MAX_FAILURES = 10
/** ...the e-mail is locked out for this long (counted from the attempts) */
export const LOCKOUT_MINUTES = 15

export type LoginResult =
  | { ok: true; user: { id: number; email: string; fullName: string | null } }
  | { ok: false; reason: 'invalid' | 'locked' }

interface LoginInput {
  /** Already lowercased by the validator */
  email: string
  password: string
  ip?: string | null
  now?: Date
}

/**
 * Checks an e-mail and password. Every attempt is recorded; too many wrong
 * ones in a row lock that e-mail for a while, even with the right password,
 * since the app is open on the internet. A wrong e-mail and a wrong password
 * answer the same, and take the same time.
 */
export async function attemptLogin({
  email,
  password,
  ip = null,
  now = new Date(),
}: LoginInput): Promise<LoginResult> {
  if (await lockedOut(email, now)) {
    await db.loginAttempt.create({ data: { email, ip, succeeded: false, createdAt: now } })
    return { ok: false, reason: 'locked' }
  }

  const user = await db.user.findUnique({ where: { email } })
  const valid = await verifyPassword(password, user?.password ?? DUMMY_HASH)
  await db.loginAttempt.create({
    data: { email, ip, succeeded: Boolean(user && valid), createdAt: now },
  })
  if (!user || !valid) return { ok: false, reason: 'invalid' }
  return { ok: true, user: { id: user.id, email: user.email, fullName: user.fullName } }
}

/** Too many failures in the window, since the last login that worked */
async function lockedOut(email: string, now: Date) {
  const windowStart = new Date(now.getTime() - LOCKOUT_MINUTES * 60_000)
  const lastSuccess = await db.loginAttempt.findFirst({
    where: { email, succeeded: true, createdAt: { gt: windowStart } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  const failures = await db.loginAttempt.count({
    where: {
      email,
      succeeded: false,
      createdAt: { gt: lastSuccess?.createdAt ?? windowStart, lte: now },
    },
  })
  return failures >= MAX_FAILURES
}
