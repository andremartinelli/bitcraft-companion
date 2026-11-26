'use server'

import { refresh } from 'next/cache'
import { requireUser } from '@/lib/session'
import { saveCountedClaim } from '@/models/counted_claim'
import { claimGamePlayer, releaseGamePlayer } from '@/models/game_player'
import { findPlayerByNick } from '@/services/game_sync/find_player'
import { countedClaimSchema, gamePlayerSchema } from '@/validators/game_player'

export interface GamePlayerFormState {
  error: string | null
  notice: string | null
  /** Typed back into the field after an error */
  username: string
}

const failed = (error: string, username: string): GamePlayerFormState => ({
  error,
  notice: null,
  username,
})

/**
 * POST /game_player: the account's character, by the exact nick, after
 * finding it on BitJita (public data). No player token is involved.
 */
export async function createGamePlayer(
  _previous: GamePlayerFormState,
  formData: FormData
): Promise<GamePlayerFormState> {
  const user = await requireUser()
  const typed = String(formData.get('username') ?? '')
  const parsed = gamePlayerSchema.safeParse({ username: typed })
  if (!parsed.success) return failed(parsed.error.issues[0].message, typed)
  const { username } = parsed.data

  const found = await findPlayerByNick(username)
  if (!found.ok) return failed(found.error, typed)

  const player = await claimGamePlayer(user.id, found.player)
  refresh()
  return {
    error: null,
    notice: `${player.username} é o seu personagem. Sincronize o inventário para ver os itens.`,
    username: '',
  }
}

/**
 * DELETE /game_player, after the confirmation: the account has no character
 * any more, and its items leave the app (nothing changes in the game, nor for
 * another account with the same character).
 */
export async function destroyGamePlayer(): Promise<{ notice: string }> {
  const user = await requireUser()
  const removed = await releaseGamePlayer(user.id)
  refresh()
  return {
    notice: removed
      ? `${removed.username} removido do seu inventário.`
      : 'Você já não tinha personagem.',
  }
}

/**
 * PATCH /game_player/claims/[id]: the claim's chests count toward the
 * account's inventory, or stop counting. Only a claim of its character.
 */
export async function updateCountedClaim(claimEntityId: string, counted: boolean) {
  const user = await requireUser()
  const parsed = countedClaimSchema.safeParse({ claimEntityId, counted })
  if (parsed.success) await saveCountedClaim(user.id, parsed.data.claimEntityId, parsed.data.counted)
  refresh()
}
