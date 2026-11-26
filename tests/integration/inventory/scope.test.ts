import { beforeEach, describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import { insertGroup } from '@/models/group'
import { insertPlan } from '@/models/plan'
import { savePlanInventoryChoice } from '@/models/plan_user_setting'
import { saveTaskInventoryChoice } from '@/models/task_inventory_setting'
import { emptyState } from '@/services/calculator/state_params'
import { inventoryScope, taskInventoryScope } from '@/services/inventory/scope'

let next = 0
/** An account with its own character (`player`: an id to share one), a member of claim "c<n>" */
async function account(player?: number | null) {
  next++
  const claims = [{ entityId: `c${next}`, name: `Vila ${next}` }]
  const gamePlayerId =
    player === undefined
      ? (
          await db.gamePlayer.create({
            data: { username: `P${next}`, entityId: `${next}`, claims },
          })
        ).id
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
      claimIds: [],
      excludedBuildingIds: [],
      people: [],
      claims: [],
      hasMine: true,
    })
    const none = await inventoryScope((await account(null)).id)
    expect([none.playerIds, none.hasMine]).toEqual([[], false])
  })

  test('a plan nobody else has: only mine', async () => {
    const plan = await newPlan(me.id)
    expect(await inventoryScope(me.id, plan.id)).toEqual({
      playerIds: [me.player],
      claimIds: [],
      excludedBuildingIds: [],
      people: [{ gamePlayerId: me.player, name: expect.any(String), mine: true, used: true }],
      claims: [],
      hasMine: true,
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
    expect(scope.people.filter((person) => !person.mine)).toHaveLength(2)
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

    expect((await inventoryScope(me.id, plan.id)).people).toEqual([
      { gamePlayerId: me.player, name: expect.any(String), mine: true, used: true },
    ])
  })

  test('"Inventários": each account leaves characters out for itself, its own too', async () => {
    const other = await account()
    const plan = await newPlan(me.id)
    await db.planShare.create({ data: { planId: plan.id, userId: other.id } })
    await savePlanInventoryChoice(plan.id, me.id, { gamePlayerId: other.player!, used: false })

    const scope = await inventoryScope(me.id, plan.id)
    expect(scope.playerIds).toEqual([me.player])
    expect(scope.people.map((person) => [person.mine, person.used])).toEqual([
      [true, true],
      [false, false],
    ])
    expect((await inventoryScope(other.id, plan.id)).playerIds.sort()).toEqual(
      [me.player, other.player].sort()
    )

    await savePlanInventoryChoice(plan.id, me.id, { gamePlayerId: me.player!, used: false })
    await savePlanInventoryChoice(plan.id, me.id, { gamePlayerId: other.player!, used: true })
    expect((await inventoryScope(me.id, plan.id)).playerIds).toEqual([other.player])
  })

  test('without a character of my own, the plan still shows the others', async () => {
    const owner = await account()
    const mine = await account(null)
    const plan = await newPlan(owner.id)
    await db.planShare.create({ data: { planId: plan.id, userId: mine.id } })

    expect((await inventoryScope(mine.id, plan.id)).playerIds).toEqual([owner.player])
  })

  describe("the claims' chests", () => {
    const counts = async (userId: number) => {
      const user = await db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { gamePlayer: { select: { claims: true } } },
      })
      const [claim] = user.gamePlayer!.claims as { entityId: string }[]
      await db.countedClaim.create({ data: { userId, claimEntityId: claim.entityId } })
      return claim.entityId
    }

    test('outside a plan: the claims the account counts, not the others', async () => {
      const mine = await counts(me.id)
      const other = await account()
      await counts(other.id)
      expect((await inventoryScope(me.id)).claimIds).toEqual([mine])
    })

    test('a claim the character left stops counting', async () => {
      await counts(me.id)
      await db.gamePlayer.update({ where: { id: me.player! }, data: { claims: [] } })
      expect((await inventoryScope(me.id)).claimIds).toEqual([])
    })

    test("in a plan: the claims of the plan's people come with them, each once", async () => {
      const [other, twin] = [await account(), await account()]
      const plan = await newPlan(me.id)
      await db.planShare.createMany({
        data: [other, twin].map((person) => ({ planId: plan.id, userId: person.id })),
      })
      const mine = await counts(me.id)
      const theirs = await counts(other.id)
      // Twin's character is in my claim too, and counts it
      await db.gamePlayer.update({
        where: { id: twin.player! },
        data: { claims: [{ entityId: mine, name: 'Minha' }] },
      })
      await db.countedClaim.create({ data: { userId: twin.id, claimEntityId: mine } })

      const scope = await inventoryScope(me.id, plan.id)
      expect(scope.claimIds.sort()).toEqual([mine, theirs].sort())
      expect(scope.claims.every((claim) => claim.used)).toBe(true)
      // Outside the plan, only mine, and no menu
      expect((await inventoryScope(me.id)).claimIds).toEqual([mine])
      expect((await inventoryScope(me.id)).claims).toEqual([])
      // Leaving a person out leaves their claims in: each one is its own choice
      await savePlanInventoryChoice(plan.id, me.id, { gamePlayerId: other.player!, used: false })
      expect((await inventoryScope(me.id, plan.id)).claimIds.sort()).toEqual([mine, theirs].sort())
    })

    test('in a plan, each account leaves out claims for itself', async () => {
      const other = await account()
      const plan = await newPlan(me.id)
      await db.planShare.create({ data: { planId: plan.id, userId: other.id } })
      const mine = await counts(me.id)
      const theirs = await counts(other.id)

      await savePlanInventoryChoice(plan.id, me.id, { claimEntityId: theirs, used: false })

      const scope = await inventoryScope(me.id, plan.id)
      expect(scope.claimIds).toEqual([mine])
      expect(scope.claims.find((claim) => claim.entityId === theirs)?.used).toBe(false)
      // The other account still uses both
      expect((await inventoryScope(other.id, plan.id)).claimIds.sort()).toEqual(
        [mine, theirs].sort()
      )
    })
  })

  describe('the Tasks page', () => {
    const inGroup = async (owner: number, ...people: number[]) => {
      const { group } = await insertGroup(owner, `G${owner}`)
      await db.groupMember.createMany({
        data: people.map((userId) => ({ groupId: group!.id, userId })),
      })
    }
    const counts = async (userId: number) => {
      const user = await db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { gamePlayer: { select: { claims: true } } },
      })
      const [claim] = user.gamePlayer!.claims as { entityId: string }[]
      await db.countedClaim.create({ data: { userId, claimEntityId: claim.entityId } })
      return claim.entityId
    }

    test('by default: my character and my claims; people of my groups are listed, unticked', async () => {
      const [member, outsider] = [await account(), await account()]
      await inGroup(me.id, member.id)
      const mine = await counts(me.id)
      await counts(member.id)

      const scope = await taskInventoryScope(me.id)
      expect([scope.playerIds, scope.claimIds]).toEqual([[me.player], [mine]])
      expect(scope.people.map((person) => [person.gamePlayerId, person.used])).toEqual([
        [me.player, true],
        [member.player, false],
      ])
      expect(scope.people.map((person) => person.gamePlayerId)).not.toContain(outsider.player)
      // Only my claims: a person's claims don't come along
      expect(scope.claims.map((claim) => claim.entityId)).toEqual([mine])
    })

    test("a person of another account's group counts when ticked, and stops when they leave", async () => {
      const [owner, member] = [await account(), await account()]
      await inGroup(owner.id, me.id, member.id)
      await saveTaskInventoryChoice(me.id, { gamePlayerId: member.player!, used: true }, false)
      await saveTaskInventoryChoice(me.id, { gamePlayerId: me.player!, used: false }, true)

      expect((await taskInventoryScope(me.id)).playerIds).toEqual([member.player])
      await db.groupMember.deleteMany({ where: { userId: member.id } })
      expect((await taskInventoryScope(me.id)).playerIds).toEqual([])
    })

    test('each claim of mine can be left out', async () => {
      const mine = await counts(me.id)
      await saveTaskInventoryChoice(me.id, { claimEntityId: mine, used: false }, false)
      const scope = await taskInventoryScope(me.id)
      expect([scope.claimIds, scope.claims[0].used]).toEqual([[], false])
    })
  })
})
