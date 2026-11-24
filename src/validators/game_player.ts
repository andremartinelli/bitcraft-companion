import { z } from 'zod'

const NICK_MESSAGE = 'Informe o nick do personagem.'

/** POST /game_players: the exact nick, as in the game */
export const gamePlayerSchema = z.object({
  username: z.string({ error: NICK_MESSAGE }).trim().min(1, NICK_MESSAGE).max(40, NICK_MESSAGE),
})

/** DELETE /game_players/[id] */
export const gamePlayerIdSchema = z.coerce.number().int().positive().max(2_147_483_647)
