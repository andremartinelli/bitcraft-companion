import { z } from 'zod'
import { INVENTORY_TABS } from '@/services/inventory/stock'

/** GET /inventory: the tab and the item search. An unknown tab falls back to the first one */
export const inventorySearchSchema = z.object({
  tab: z.enum(INVENTORY_TABS).optional(),
  q: z.string().trim().max(100).optional(),
})

/**
 * POST /api/inventory/sync: everything now, or only what is old (a page found
 * it old); the account's character, or a plan's characters
 */
export const inventorySyncSchema = z.object({
  onlyIfStale: z.boolean().default(false),
  planId: z.number().int().positive().max(2_147_483_647).optional(),
})
