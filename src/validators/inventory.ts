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
  /** The Tasks page: also the characters ticked in its "Inventários" */
  tasks: z.boolean().optional(),
})

/**
 * PATCH /plans/[id]/setting and /tasks/inventory: whether a character or a
 * counted claim of the "Inventários" menu counts (BitJita's ids are digits)
 */
export const inventoryChoiceSchema = z.union([
  z.object({ gamePlayerId: z.number().int().positive().max(2_147_483_647), used: z.boolean() }),
  z.object({ claimEntityId: z.string().regex(/^\d{1,20}$/), used: z.boolean() }),
])
