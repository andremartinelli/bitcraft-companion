import { searchBuildings, searchItems } from '@/models/item'
import { itemSearchSchema } from '@/validators/item'
import { parseSearchParams } from '@/validators/search_params'

/**
 * GET /api/items/search?q=: the calculator's picker, while typing. Items
 * and buildings (construction recipes). A route handler, not a server
 * action: actions are POST and run one after another.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const { q } = parseSearchParams(itemSearchSchema, Object.fromEntries(searchParams))
  const [items, buildings] = await Promise.all([searchItems(q), searchBuildings(q)])
  return Response.json({ items, buildings })
}
