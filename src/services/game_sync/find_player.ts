import { BitJitaError } from '@/services/game_sync/bitjita_client'
import { inventorySource, type PlayerInfo } from '@/services/game_sync/inventory_source'

export type FindPlayerResult = { ok: true; player: PlayerInfo } | { ok: false; error: string }

/**
 * A character by its exact nick on BitJita (public data, no player token),
 * or why not, in Portuguese: Meu personagem and the sign-up page.
 */
export async function findPlayerByNick(username: string): Promise<FindPlayerResult> {
  let player
  try {
    player = await inventorySource().findPlayer(username)
  } catch (error) {
    if (!(error instanceof BitJitaError)) throw error
    return { ok: false, error: `Não foi possível consultar a BitJita agora: ${error.message}.` }
  }
  if (!player) return { ok: false, error: `Nenhum personagem chamado "${username}" na BitJita.` }
  return { ok: true, player }
}
