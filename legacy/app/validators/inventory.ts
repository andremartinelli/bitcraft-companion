import vine from '@vinejs/vine'

/**
 * GET /inventory: the tab and the item search. Unknown tabs fall back to the
 * first tab (by profession) instead of failing.
 */
export const inventorySearchValidator = vine.create({
  tab: vine.enum(['professions', 'group', 'players', 'places'] as const).optional(),
  q: vine.string().trim().maxLength(100).optional(),
})
