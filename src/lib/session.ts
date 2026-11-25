import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { cache } from 'react'
import { db } from '@/lib/db'
import {
  createSessionToken,
  readSessionToken,
  SESSION_COOKIE,
  SESSION_DAYS,
} from '@/services/auth/session_token'

/**
 * The logged-in user, from the session cookie. The proxy only checks that
 * the cookie is valid; pages, actions and route handlers call these, which
 * also check the account still exists.
 */

export interface CurrentUser {
  id: number
  email: string
  fullName: string | null
  /** The account's character (Meu personagem), or null */
  gamePlayerId: number | null
}

/** The account of a session token, if the token is valid and the account still exists */
async function userFromToken(token: string | undefined): Promise<CurrentUser | null> {
  const userId = await readSessionToken(token)
  if (!userId) return null
  return db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, fullName: true, gamePlayerId: true },
  })
}

/** The user of this request (pages and server actions), or null. Once per request */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies()
  return userFromToken(store.get(SESSION_COOKIE)?.value)
})

/** Route handlers: the user of the request they receive, or null */
export function userFromRequest(request: NextRequest): Promise<CurrentUser | null> {
  return userFromToken(request.cookies.get(SESSION_COOKIE)?.value)
}

/** Pages and server actions: the user, or off to the login page */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

export async function startSession(userId: number) {
  const store = await cookies()
  store.set(SESSION_COOKIE, await createSessionToken(userId), {
    httpOnly: true,
    // HTTPS on Vercel; plain http on localhost while developing
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 3600,
  })
}

export async function endSession() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

/** A path on this site ("/plans/3?x=1"), never another host ("//evil", "https://...") */
export function localPath(value: unknown): string | null {
  return typeof value === 'string' && /^\/(?![/\\])[^\s\\]*$/.test(value) ? value : null
}
