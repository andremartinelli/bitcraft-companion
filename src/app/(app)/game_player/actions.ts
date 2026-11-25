'use server'

import { refresh } from 'next/cache'
import { requireUser } from '@/lib/session'
import { chooseLegacyPlayer, claimGamePlayer, releaseGamePlayer } from '@/models/game_player'
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

  let found
  try {
    found = await inventorySource().findPlayer(username)
  } catch (error) {
    if (!(error instanceof BitJitaError)) throw error
    return failed(`Não foi possível consultar a BitJita agora: ${error.message}.`, typed)
  }
  if (!found) return failed(`Nenhum personagem chamado "${username}" na BitJita.`, typed)

  const player = await claimGamePlayer(user.id, found)
  refresh()
  return {
    error: null,
    notice: `${player.username} é o seu personagem. Sincronize o inventário para ver os itens.`,
    username: '',
  }
}

/**
 * PATCH /game_player: an account that followed several characters chooses
 * its own ("É o meu"); the others leave its list.
 */
export async function updateGamePlayer(id: number): Promise<{ notice: string }> {
  const user = await requireUser()
  const playerId = gamePlayerIdSchema.safeParse(id)
  const chosen = playerId.success ? await chooseLegacyPlayer(user.id, playerId.data) : null
  refresh()
  return {
    notice: chosen
      ? `${chosen.username} é o seu personagem.`
      : 'Esse personagem já não estava na sua lista.',
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
