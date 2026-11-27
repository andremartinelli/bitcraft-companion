import { z } from 'zod'

/** Show, collapse or hide the steps of other professions */
export const OTHER_STEPS_MODES = ['show', 'collapse', 'hide'] as const
export const otherStepsSchema = z.enum(OTHER_STEPS_MODES)

/** PATCH /account/professions/[skillId]: "Minhas profissões" */
export const professionChoiceSchema = z.object({
  skillId: z.number().int().positive().max(2_147_483_647),
  on: z.boolean(),
})
