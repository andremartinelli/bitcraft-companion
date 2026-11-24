import { db } from '@/lib/db'
import { createUser, CreateUserError } from '@/services/auth/create_user'

/** New accounts from one IP in a day: the app is open, and the free plans are small */
export const MAX_SIGNUPS_PER_IP = 5
const DAY_MS = 24 * 3_600_000

export type SignupResult =
  | { ok: true; user: { id: number; email: string; fullName: string | null } }
  | { ok: false; error: string }

/**
 * The sign-up page: anyone can create an account, up to MAX_SIGNUPS_PER_IP
 * a day from the same IP. Without an IP (local), there is no limit.
 */
export async function signUp({
  email,
  fullName,
  password,
  ip = null,
  now = new Date(),
}: {
  email: string
  fullName: string
  password: string
  ip?: string | null
  now?: Date
}): Promise<SignupResult> {
  if (ip) {
    const recent = await db.user.count({
      where: { signupIp: ip, createdAt: { gt: new Date(now.getTime() - DAY_MS) } },
    })
    if (recent >= MAX_SIGNUPS_PER_IP) {
      return {
        ok: false,
        error: 'Muitas contas novas criadas daqui hoje. Tente de novo amanhã.',
      }
    }
  }
  try {
    return { ok: true, user: await createUser({ email, fullName, password, signupIp: ip }) }
  } catch (error) {
    if (error instanceof CreateUserError) return { ok: false, error: error.message }
    throw error
  }
}
