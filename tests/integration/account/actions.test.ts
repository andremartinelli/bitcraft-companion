import { beforeEach, describe, expect, test, vi } from 'vitest'

// The session cookie of the request, and the page refresh after a change
const request = vi.hoisted(() => ({ token: undefined as string | undefined }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'session' && request.token ? { value: request.token } : undefined,
  }),
}))
vi.mock('next/cache', () => ({ refresh: vi.fn() }))

import {
  acceptGroupInvite,
  createGroup,
  createGroupInvite,
  destroyGroupMember,
  updateGroupMember,
} from '@/app/(app)/account/actions'
import { db } from '@/lib/db'
import { createUser } from '@/services/auth/create_user'
import { createSessionToken } from '@/services/auth/session_token'

const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

const EMPTY = { error: null, value: '' }

/** Where an action sent the browser (it throws Next's redirect) */
async function redirectedTo(action: Promise<unknown>) {
  const error = await action.then(
    () => null,
    (e: unknown) => e
  )
  const digest = String((error as { digest?: string } | null)?.digest ?? '')
  if (!digest.startsWith('NEXT_REDIRECT')) throw new Error(`no redirect: ${String(error)}`)
  return digest.split(';')[2]
}

describe('account actions', () => {
  let vitorId: number
  let andreId: number

  const as = async (id: number) => {
    request.token = await createSessionToken(id)
  }

  beforeEach(async () => {
    vitorId = (await createUser({ email: 'vitor@example.com', password: 'a-long-enough-password' }))
      .id
    andreId = (await createUser({ email: 'andre@example.com', password: 'a-long-enough-password' }))
      .id
    await as(vitorId)
  })

  test('creating a group: a name of up to 60 characters', async () => {
    expect(await createGroup(EMPTY, form({ name: '   ' }))).toEqual({
      error: 'Dê ao grupo um nome de até 60 caracteres.',
      value: '   ',
    })
    expect(await createGroup(EMPTY, form({ name: ' Clã ' }))).toEqual(EMPTY)
    const group = await db.group.findFirstOrThrow({ include: { members: true } })
    expect([group.name, group.ownerId, group.members.map((m) => m.userId)]).toEqual([
      'Clã',
      vitorId,
      [vitorId],
    ])
  })

  test('invite, accept, turn on the automatic sharing and leave', async () => {
    await createGroup(EMPTY, form({ name: 'Clã' }))
    const group = await db.group.findFirstOrThrow()

    expect((await createGroupInvite(group.id, EMPTY, form({ email: 'nope' }))).error).toBe(
      'Informe um e-mail válido.'
    )
    const invited = await createGroupInvite(group.id, EMPTY, form({ email: 'ANDRE@example.com' }))
    expect(invited).toEqual({
      error: null,
      notice: 'Convite criado. Mande este link para andre@example.com:',
      token: expect.any(String),
      value: '',
    })

    await as(andreId)
    expect(await redirectedTo(acceptGroupInvite('not-the-token'))).toBe('/account')
    expect(await db.groupMember.count()).toBe(1)
    expect(await redirectedTo(acceptGroupInvite(invited.token!))).toBe('/account')
    await updateGroupMember(group.id, true)
    expect(
      await db.groupMember.findMany({
        orderBy: { userId: 'asc' },
        select: { userId: true, autoSharePlans: true },
      })
    ).toEqual([
      { userId: vitorId, autoSharePlans: false },
      { userId: andreId, autoSharePlans: true },
    ])

    await destroyGroupMember(group.id, andreId)
    expect(await db.groupMember.count()).toBe(1)
  })
})
