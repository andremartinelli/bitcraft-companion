import { beforeEach, describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import { insertGroup } from '@/models/group'
import { insertPlan } from '@/models/plan'
import { saveOnlyMyInventory } from '@/models/plan_user_setting'
import { emptyState } from '@/services/calculator/state_params'
import { inventoryScope } from '@/services/inventory/scope'

let next = 0
/** An account with its own character (`player`: an id to share one) */
async function account(player?: number | null) {
  next++
  const gamePlayerId =
    player === undefined
      ? (await db.gamePlayer.create({ data: { username: `P${next}`, entityId: `${next}` } })).id
      : player
  const user = await db.user.create({
    data: { email: `p${next}@example.com`, password: '-', gamePlayerId },
  })
  return { id: user.id, player: gamePlayerId }
}

const newPlan = (userId: number) => insertPlan({ name: 'Plano', state: emptyState(), userId })

describe('whose inventory a page uses', () => {
  let me: { id: number; player: number | null }

  beforeEach(async () => {
    me = await account()
  })

  test("outside a plan: only the account's character, or none", async () => {
    await account()
    expect(await inventoryScope(me.id)).toEqual({
      playerIds: [me.player],
      hasMine: true,
      hasOthers: false,
      onlyMine: false,
    })
    const none = await inventoryScope((await account(null)).id)
    expect([none.playerIds, none.hasMine]).toEqual([[], false])
  })

  test('a plan nobody else has: only mine', async () => {
    const plan = await newPlan(me.id)
    expect(await inventoryScope(me.id, plan.id)).toEqual({
      playerIds: [me.player],
      hasMine: true,
      hasOthers: false,
      onlyMine: false,
    })
  })

  test('a plan shared one by one: the owner, me and the others it was shared with', async () => {
    const [owner, other, outsider] = [await account(), await account(), await account()]
    const plan = await newPlan(owner.id)
    await db.planShare.createMany({
      data: [me, other].map((person) => ({ planId: plan.id, userId: person.id })),
    })

    const scope = await inventoryScope(me.id, plan.id)
    expect(scope.playerIds.sort()).toEqual([me.player, owner.player, other.player].sort())
    expect(scope.playerIds).not.toContain(outsider.player)
    expect(scope.hasOthers).toBe(true)
  })

  test('"Todos do grupo": every member, also whoever joins later', async () => {
    const [member, later] = [await account(), await account()]
    const { group } = await insertGroup(me.id, 'Guilda')
    await db.groupMember.create({ data: { groupId: group!.id, userId: member.id } })
    const plan = await newPlan(me.id)
    await db.planGroupShare.create({ data: { planId: plan.id, groupId: group!.id } })
    await db.groupMember.create({ data: { groupId: group!.id, userId: later.id } })

    expect((await inventoryScope(me.id, plan.id)).playerIds.sort()).toEqual(
      [me.player, member.player, later.player].sort()
    )
  })

  test('the same character counts once', async () => {
    const twin = await account(me.player)
    const other = await account()
    const otherTwin = await account(other.player)
    const plan = await newPlan(me.id)
    await db.planShare.createMany({
      data: [twin, other, otherTwin].map((person) => ({ planId: plan.id, userId: person.id })),
    })

    expect((await inventoryScope(me.id, plan.id)).playerIds).toEqual([me.player, other.player])
  })

  test('the same character as mine is not "someone else"', async () => {
    const twin = await account(me.player)
    const plan = await newPlan(me.id)
    await db.planShare.create({ data: { planId: plan.id, userId: twin.id } })

    expect((await inventoryScope(me.id, plan.id)).hasOthers).toBe(false)
  })

  test('"Usar apenas meu inventário": mine only, for me only', async () => {
    const other = await account()
    const plan = await newPlan(me.id)
    await db.planShare.create({ data: { planId: plan.id, userId: other.id } })
    await saveOnlyMyInventory(plan.id, me.id, true)

    expect(await inventoryScope(me.id, plan.id)).toEqual({
      playerIds: [me.player],
      hasMine: true,
      hasOthers: true,
      onlyMine: true,
    })
    expect((await inventoryScope(other.id, plan.id)).playerIds.sort()).toEqual(
      [me.player, other.player].sort()
    )
  })

  test('without a character of my own, the plan still shows the others', async () => {
    const owner = await account()
    const mine = await account(null)
    const plan = await newPlan(owner.id)
    await db.planShare.create({ data: { planId: plan.id, userId: mine.id } })

    expect((await inventoryScope(mine.id, plan.id)).playerIds).toEqual([owner.player])
  })
})
