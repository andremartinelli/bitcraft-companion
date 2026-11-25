import { z } from 'zod'

const NICK_MESSAGE = 'Informe o nick do personagem.'

/** POST /game_player: the exact nick, as in the game */
export const gamePlayerSchema = z.object({
  username: z.string({ error: NICK_MESSAGE }).trim().min(1, NICK_MESSAGE).max(40, NICK_MESSAGE),
})

/** PATCH /game_player: the character chosen among the ones the account followed */
export const gamePlayerIdSchema = z.coerce.number().int().positive().max(2_147_483_647)
