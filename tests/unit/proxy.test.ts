import { NextRequest } from 'next/server'
import { beforeAll, describe, expect, test } from 'vitest'
import { localPath } from '@/lib/session'
import { proxy } from '@/proxy'
import { createSessionToken, SESSION_COOKIE } from '@/services/auth/session_token'

beforeAll(() => {
  process.env.SESSION_SECRET = 'a-test-secret-that-is-long-enough-123456'
})

const request = (path: string, token?: string) =>
  new NextRequest(`http://localhost:3100${path}`, {
    headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
  })

describe('proxy', () => {
  test('a page without a session goes to the login, and back afterwards', async () => {
    const response = await proxy(request('/recipes?q=plank'))

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location')!)
    expect(location.pathname).toBe('/login')
    expect(location.searchParams.get('next')).toBe('/recipes?q=plank')

    const home = await proxy(request('/'))
    expect(home.headers.get('location')).toBe('http://localhost:3100/login')
  })

  test('the API answers 401 without a session', async () => {
    const response = await proxy(request('/api/items/search?q=plank'))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Faça login para continuar.' })
  })

  test('a valid session goes through; an invalid one does not', async () => {
    const token = await createSessionToken(1)
    const valid = await proxy(request('/recipes', token))
    expect(valid.headers.get('x-middleware-next')).toBe('1')

    const forged = await proxy(request('/recipes', `${token}x`))
    expect(forged.status).toBe(307)
  })

  test('the login, the sign-up and the cron are open', async () => {
    for (const path of ['/login', '/login?next=/plans', '/signup', '/api/cron/inventory-sync']) {
      const response = await proxy(request(path))
      expect(response.headers.get('x-middleware-next')).toBe('1')
    }
  })
})

describe('going back after the login', () => {
  test('only to a path of this site', () => {
    expect(localPath('/plans/3?x=1')).toBe('/plans/3?x=1')
    for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', 'plans', '', null]) {
      expect(localPath(bad)).toBeNull()
    }
  })
})
