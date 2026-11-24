import { z } from 'zod'
import { INVENTORY_TABS } from '@/services/inventory/stock'

/** GET /inventory: the tab and the item search. An unknown tab falls back to the first one */
export const inventorySearchSchema = z.object({
  tab: z.enum(INVENTORY_TABS).optional(),
  q: z.string().trim().max(100).optional(),
})
