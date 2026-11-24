import type { NextRequest } from 'next/server'
import { userFromRequest } from '@/lib/session'
import { searchBuildings, searchItems } from '@/models/item'
import { itemSearchSchema } from '@/validators/item'
import { parseSearchParams } from '@/validators/search_params'

/**
 * GET /api/items/search?q=: the calculator's picker, while typing. Items
 * and buildings (construction recipes). A route handler, not a server
 * action: actions are POST and run one after another.
 */
export async function GET(request: NextRequest) {
  if (!(await userFromRequest(request))) {
    return Response.json({ error: 'Faça login para continuar.' }, { status: 401 })
  }
  const { q } = parseSearchParams(
    itemSearchSchema,
    Object.fromEntries(request.nextUrl.searchParams)
  )
  const [items, buildings] = await Promise.all([searchItems(q), searchBuildings(q)])
  return Response.json({ items, buildings })
}
