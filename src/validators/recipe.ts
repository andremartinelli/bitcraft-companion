import { z } from 'zod'
import { queryFlag, queryInt } from '@/validators/search_params'

/**
 * GET /recipes: the search and the filters, from the query string.
 */
export const recipeSearchSchema = z.object({
  q: z.string().trim().max(100).optional(),
  kind: z.enum(['crafting', 'construction']).optional(),
  skill: queryInt(1),
  station: queryInt(1),
  tier: queryInt(0, 20),
  verb: z.string().trim().max(30).optional(),
  all: queryFlag(),
  page: queryInt(1),
})

export type RecipeSearch = z.infer<typeof recipeSearchSchema>
