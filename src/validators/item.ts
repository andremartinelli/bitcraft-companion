import { z } from 'zod'

/**
 * GET /items and GET /api/items/search: the item name.
 */
export const itemSearchSchema = z.object({
  q: z.string().trim().max(100).optional(),
})

/** /items/[id]: a positive whole number, or the page is a 404 */
export const itemIdSchema = z.coerce.number().int().positive().max(2_147_483_647)
