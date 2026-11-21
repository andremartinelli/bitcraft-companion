import vine from '@vinejs/vine'

/**
 * GET /inventory: the tab and the item search. Unknown tabs fall back to the
 * group tab instead of failing.
 */
export const inventorySearchValidator = vine.create({
  tab: vine.enum(['group', 'players', 'places'] as const).optional(),
  q: vine.string().trim().maxLength(100).optional(),
})
