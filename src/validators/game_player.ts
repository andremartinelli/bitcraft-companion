import { z } from 'zod'

const NICK_MESSAGE = 'Informe o nick do personagem.'

const NICK_MAX = 40

/** POST /game_player: the exact nick, as in the game */
export const gamePlayerSchema = z.object({
  username: z
    .string({ error: NICK_MESSAGE })
    .trim()
    .min(1, NICK_MESSAGE)
    .max(NICK_MAX, NICK_MESSAGE),
})

/** POST /signup: the nick is optional there; blank means none */
export const optionalNick = () =>
  z
    .string()
    .trim()
    .max(NICK_MAX, { error: `O nick pode ter no máximo ${NICK_MAX} caracteres.` })
    .optional()
    .transform((nick) => nick || null)

/** PATCH /game_player/claims/[id]: a claim's chests count, or not. BitJita's ids are digits */
export const countedClaimSchema = z.object({
  claimEntityId: z.string().regex(/^\d{1,20}$/),
  counted: z.boolean(),
})
