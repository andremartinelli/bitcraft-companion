import { z } from 'zod'
import { METAL_STYLES, QUICK_PLAN_KEYS } from '@/services/plans/quick_plans'

/** /plans/[id] and the actions: a positive whole number, or the page is a 404 */
export const planIdSchema = z.coerce.number().int().positive().max(2_147_483_647)

const NAME_MESSAGE = 'Dê ao plano um nome de até 80 caracteres.'

/** "Novo plano", "Salvar como plano" and renaming. The state is validated like the calculator's */
export const planNameSchema = z
  .string({ error: NAME_MESSAGE })
  .trim()
  .min(1, NAME_MESSAGE)
  .max(80, NAME_MESSAGE)

/** PATCH /plans/[id]: the name, the calculator state, or both */
export const planUpdateSchema = z.object({
  name: z.unknown().optional(),
  state: z.unknown().optional(),
})

/** PATCH /plans/[id]/setting: "Usar apenas meu inventário" */
export const planSettingSchema = z.object({ onlyMyInventory: z.boolean() })

/** POST /quick_plans and /plans/[id]/quick_plans: which set, which tier and, for the metal set, which style */
export const quickPlanSchema = z.object({
  template: z.enum(QUICK_PLAN_KEYS),
  tier: z.number().int().min(1).max(10),
  style: z.enum(METAL_STYLES).optional(),
})
