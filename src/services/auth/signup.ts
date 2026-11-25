import { db } from '@/lib/db'
import { claimGamePlayer } from '@/models/game_player'
import { createUser, CreateUserError } from '@/services/auth/create_user'
import { findPlayerByNick } from '@/services/game_sync/find_player'

/** New accounts from one IP in a day: the app is open, and the free plans are small */
export const MAX_SIGNUPS_PER_IP = 5
const DAY_MS = 24 * 3_600_000

export type SignupResult =
  | { ok: true; user: { id: number; email: string; fullName: string | null } }
  | { ok: false; error: string }

/**
 * The sign-up page: anyone can create an account, up to MAX_SIGNUPS_PER_IP
 * a day from the same IP. Without an IP (local), there is no limit. With a
 * nick, the account is created only when BitJita finds that character, and
 * starts with it (Meu personagem).
 */
export async function signUp({
  email,
  fullName,
  password,
  gamePlayerUsername = null,
  ip = null,
  now = new Date(),
}: {
  email: string
  fullName: string
  password: string
  gamePlayerUsername?: string | null
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
  // Asked before the account exists: an unknown nick or BitJita down creates nothing
  const found = gamePlayerUsername ? await findPlayerByNick(gamePlayerUsername) : null
  if (found && !found.ok) return found

  let user
  try {
    user = await createUser({ email, fullName, password, signupIp: ip })
  } catch (error) {
    if (error instanceof CreateUserError) return { ok: false, error: error.message }
    throw error
  }
  if (found) await claimGamePlayer(user.id, found.player)
  return { ok: true, user }
}
