import { z } from 'zod'
import { MAX_LIST_LENGTH } from '@/services/calculator/item_list'

/**
 * GET /items and GET /api/items/search: the item name.
 */
export const itemSearchSchema = z.object({
  q: z.string().trim().max(100).optional(),
})

/** /items/[id]: a positive whole number, or the page is a 404 */
export const itemIdSchema = z.coerce.number().int().positive().max(2_147_483_647)

/** POST /api/items/list: a list pasted into the calculator's picker */
export const itemListSchema = z.object({
  text: z.string({ error: 'A lista é inválida.' }).max(MAX_LIST_LENGTH, 'A lista é grande demais.'),
})
