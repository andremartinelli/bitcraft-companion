import { notFound, redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { localPath, startSession } from '@/lib/session'
import { isPreview, PREVIEW_EMAIL } from '@/lib/preview'

/**
 * GET /preview_session: in a Vercel preview, logs in as the test account
 * (made by the preview build, scripts/preview_prepare.ts) and goes back to
 * the page asked for. Anywhere else (production, dev, tests) it does not exist.
 */
export async function GET(request: NextRequest) {
  if (!isPreview()) notFound()
  const user = await db.user.findUnique({ where: { email: PREVIEW_EMAIL }, select: { id: true } })
  if (!user) notFound()
  await startSession(user.id)
  redirect(localPath(request.nextUrl.searchParams.get('next')) ?? '/')
}
