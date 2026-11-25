import type { NextRequest } from 'next/server'
import { userFromRequest } from '@/lib/session'
import { resolveItemList } from '@/services/calculator/item_list_resolver'
import { itemListSchema } from '@/validators/item'

/**
 * POST /api/items/list: a list pasted into the calculator's picker, with
 * each name resolved, or every problem. The browser adds it to the state
 * (a plan saves it as any other change). A route handler, not a server
 * action: actions run one after another and would hold the plan's saves.
 */
export async function POST(request: NextRequest) {
  if (!(await userFromRequest(request))) {
    return Response.json({ error: 'Faça login para continuar.' }, { status: 401 })
  }
  const parsed = itemListSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'A lista é inválida.'
    return Response.json({ items: [], buildings: [], errors: [message] }, { status: 422 })
  }
  return Response.json(await resolveItemList(parsed.data.text))
}
