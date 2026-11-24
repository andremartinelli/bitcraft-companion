'use server'

import { refresh } from 'next/cache'
import { requireUser } from '@/lib/session'
import {
  followCount,
  followGamePlayer,
  MAX_PLAYERS_PER_USER,
  unfollowGamePlayer,
} from '@/models/game_player'
import { BitJitaError } from '@/services/game_sync/bitjita_client'
import { inventorySource } from '@/services/game_sync/inventory_source'
import { gamePlayerIdSchema, gamePlayerSchema } from '@/validators/game_player'

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
 * POST /game_players: the account starts following a character, by the
 * exact nick, after finding it on BitJita (public data). No player token is
 * involved. At most MAX_PLAYERS_PER_USER per account.
 */
export async function addGamePlayer(
  _previous: GamePlayerFormState,
  formData: FormData
): Promise<GamePlayerFormState> {
  const user = await requireUser()
  const typed = String(formData.get('username') ?? '')
  const parsed = gamePlayerSchema.safeParse({ username: typed })
  if (!parsed.success) return failed(parsed.error.issues[0].message, typed)
  const { username } = parsed.data

  // Before asking BitJita: the limit needs no call
  if ((await followCount(user.id)) >= MAX_PLAYERS_PER_USER) {
    return failed(`Cada conta acompanha no máximo ${MAX_PLAYERS_PER_USER} personagens.`, typed)
  }

  let found
  try {
    found = await inventorySource().findPlayer(username)
  } catch (error) {
    if (!(error instanceof BitJitaError)) throw error
    return failed(`Não foi possível consultar a BitJita agora: ${error.message}.`, typed)
  }
  if (!found) return failed(`Nenhum personagem chamado "${username}" na BitJita.`, typed)

  const result = await followGamePlayer(user.id, found)
  if (!result.ok) return failed(result.error, typed)

  refresh()
  return {
    error: null,
    notice: `${result.username} adicionado. Sincronize o inventário para ver os itens.`,
    username: '',
  }
}

/**
 * DELETE /game_players/[id], after the confirmation: the account stops
 * following the character, and its items leave this account's inventory
 * (nothing changes in the game, nor for other accounts that follow it).
 */
export async function removeGamePlayer(id: number): Promise<{ notice: string }> {
  const user = await requireUser()
  const playerId = gamePlayerIdSchema.safeParse(id)
  const removed = playerId.success ? await unfollowGamePlayer(user.id, playerId.data) : null
  refresh()
  return {
    notice: removed
      ? `${removed.username} removido do seu inventário.`
      : 'Esse personagem já não estava na sua lista.',
  }
}
