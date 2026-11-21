import vine from '@vinejs/vine'

/**
 * Filters of GET /recipes (query string). Empty form fields are dropped by
 * the controller before validation.
 */
export const recipeSearchValidator = vine.create({
  q: vine.string().trim().maxLength(100).optional(),
  kind: vine.enum(['crafting', 'construction']).optional(),
  skill: vine.number().withoutDecimals().optional(),
  station: vine.number().withoutDecimals().optional(),
  tier: vine.number().withoutDecimals().min(0).max(20).optional(),
  verb: vine.string().trim().maxLength(30).optional(),
  all: vine.boolean().optional(),
  page: vine.number().withoutDecimals().min(1).optional(),
})
