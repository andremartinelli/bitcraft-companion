import vine from '@vinejs/vine'
import { METAL_STYLES, QUICK_PLAN_KEYS } from '#services/plans/quick_plans'

/**
 * POST /quick_plans: which set, which tier and, for the metal set, which style.
 */
export const createQuickPlanValidator = vine.create({
  template: vine.enum(QUICK_PLAN_KEYS),
  tier: vine.number().withoutDecimals().min(1).max(10),
  style: vine.enum(METAL_STYLES).optional(),
})
