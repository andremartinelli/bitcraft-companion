'use server'

import { refresh } from 'next/cache'
import { Prisma } from '@/generated/prisma/client.ts'
import { requireUser } from '@/lib/session'
import { deleteGamePlayer, findGamePlayerByEntityId, insertGamePlayer } from '@/models/game_player'
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
 * POST /game_players: adds a character by the exact nick, after finding it
 * on BitJita (public data). No player token is involved.
 */
export async function addGamePlayer(
  _previous: GamePlayerFormState,
  formData: FormData
): Promise<GamePlayerFormState> {
  await requireUser()
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

  const existing = await findGamePlayerByEntityId(found.entityId)
  if (existing) return failed(`${existing.username} já está na lista.`, typed)
  try {
    await insertGamePlayer(found)
  } catch (error) {
    // Added by the other one at the same moment
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return failed(`${found.username} já está na lista.`, typed)
    }
    throw error
  }

  refresh()
  return {
    error: null,
    notice: `${found.username} adicionado. Sincronize o inventário para ver os itens.`,
    username: '',
  }
}

/**
 * DELETE /game_players/[id], after the confirmation: its places and items
 * leave the app's inventory (nothing changes in the game).
 */
export async function removeGamePlayer(id: number): Promise<{ notice: string }> {
  await requireUser()
  const playerId = gamePlayerIdSchema.safeParse(id)
  const removed = playerId.success ? await deleteGamePlayer(playerId.data) : null
  refresh()
  return {
    notice: removed
      ? `${removed.username} removido do inventário.`
      : 'Esse personagem já tinha sido removido.',
  }
}
