import { NextResponse, type NextRequest } from 'next/server'
import { readSessionToken, SESSION_COOKIE } from '@/services/auth/session_token'

/** Open without a session: the login, the sign-up and the cron (it has its own key) */
const PUBLIC_PATHS = [/^\/login$/, /^\/signup$/, /^\/api\/cron\//]

/**
 * The app is public on the internet: every request needs a valid session
 * cookie. Pages go to the login (and back afterwards); the API answers 401.
 * A first barrier only: pages, actions and route handlers check again
 * (src/lib/session.ts).
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  if (PUBLIC_PATHS.some((path) => path.test(pathname))) return NextResponse.next()

  const userId = await readSessionToken(request.cookies.get(SESSION_COOKIE)?.value)
  if (userId) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 })
  }
  const login = new URL('/login', request.url)
  if (pathname !== '/') login.searchParams.set('next', `${pathname}${search}`)
  return NextResponse.redirect(login)
}

export const config = {
  // Everything but Next's own files and static assets
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)'],
}
