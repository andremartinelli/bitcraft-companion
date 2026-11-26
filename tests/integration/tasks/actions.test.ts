import { beforeEach, describe, expect, test, vi } from 'vitest'

// The session cookie of the request, and the page refresh after a save
const request = vi.hoisted(() => ({ token: undefined as string | undefined }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'session' && request.token ? { value: request.token } : undefined,
  }),
}))
vi.mock('next/cache', () => ({ refresh: vi.fn() }))

import { updateTaskInventory } from '@/app/(app)/tasks/actions'
import { db } from '@/lib/db'
import { insertGroup } from '@/models/group'
import { taskInventorySetting } from '@/models/task_inventory_setting'
import { createUser } from '@/services/auth/create_user'
import { createSessionToken } from '@/services/auth/session_token'

describe('the Tasks page "Inventários" menu', () => {
  beforeEach(() => {
    request.token = undefined
  })

  test('only characters and claims of my menu, and mine is told apart', async () => {
    const claim = { entityId: '200000000000000001', name: 'Vila', inventory: true }
    const [mine, member, stranger] = await Promise.all(
      ['1', '2', '3'].map((n) =>
        db.gamePlayer.create({
          data: { username: `P${n}`, entityId: `10000000000000000${n}`, claims: [claim] },
        })
      )
    )
    const user = await createUser({ email: 'a@example.com', password: 'senha-segura-1' })
    await db.user.update({ where: { id: user.id }, data: { gamePlayerId: mine.id } })
    await db.countedClaim.create({ data: { userId: user.id, claimEntityId: claim.entityId } })
    const other = await db.user.create({
      data: { email: 'b@example.com', password: '-', gamePlayerId: member.id },
    })
    const { group } = await insertGroup(user.id, 'Guilda')
    await db.groupMember.create({ data: { groupId: group!.id, userId: other.id } })
    request.token = await createSessionToken(user.id)

    await updateTaskInventory({ gamePlayerId: member.id, used: true })
    await updateTaskInventory({ gamePlayerId: mine.id, used: false })
    await updateTaskInventory({ claimEntityId: claim.entityId, used: false })
    // Not in my menu, or not valid
    await updateTaskInventory({ gamePlayerId: stranger.id, used: true })
    await updateTaskInventory({ claimEntityId: '200000000000000009', used: false })
    await updateTaskInventory({ gamePlayerId: -1, used: true })

    expect(await taskInventorySetting(user.id)).toEqual({
      withoutMine: true,
      gamePlayerIds: [member.id],
      excludedClaimIds: [claim.entityId],
    })
  })

  test('without a session it asks for the login', async () => {
    await expect(updateTaskInventory({ gamePlayerId: 1, used: true })).rejects.toThrow()
    expect(await db.taskInventorySetting.count()).toBe(0)
  })
})
