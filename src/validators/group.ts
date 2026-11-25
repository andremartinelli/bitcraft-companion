import { z } from 'zod'
import { email } from '@/validators/user'

/** Ids of groups, invites and accounts in the actions */
export const idSchema = z.coerce.number().int().positive().max(2_147_483_647)

const NAME_MESSAGE = 'Dê ao grupo um nome de até 60 caracteres.'

/** POST /groups */
export const groupNameSchema = z
  .string({ error: NAME_MESSAGE })
  .trim()
  .min(1, NAME_MESSAGE)
  .max(60, NAME_MESSAGE)

/** POST /groups/[id]/invites: any e-mail, with an account or not yet */
export const groupInviteSchema = z.object({ email: email() })
