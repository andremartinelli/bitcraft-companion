import { beforeEach, describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import {
  acceptInvite,
  countInvites,
  deleteGroup,
  insertGroup,
  inviteToGroup,
  listGroups,
  listInvites,
  MAX_GROUP_PEOPLE,
  removeInvite,
  removeMember,
  setAutoShare,
} from '@/models/group'
import { insertPlan, sharePlan, sharePlanWithGroup } from '@/models/plan'
import { createUser } from '@/services/auth/create_user'
import { emptyState } from '@/services/calculator/state_params'

const account = async (email: string, fullName?: string) => {
  const user = await createUser({ email, fullName, password: 'a-long-enough-password' })
  return { id: user.id, email }
}

const planOf = (userId: number) => insertPlan({ name: 'Plano', state: emptyState(), userId })

describe('groups', () => {
  let vitor: { id: number; email: string }
  let andre: { id: number; email: string }

  beforeEach(async () => {
    vitor = await account('vitor@example.com', 'Vitor')
    andre = await account('andre@example.com', 'André')
  })

  /** Vitor's group with André in it, through the invite */
  const clan = async (name = 'Clã') => {
    const group = await insertGroup(vitor.id, name)
    await inviteToGroup(group.id, vitor.id, andre.email)
    await acceptInvite((await listInvites(andre.email)).at(-1)!.id, andre)
    return group
  }

  test('the owner is in the group it creates; pending invites only show to the owner', async () => {
    const group = await insertGroup(vitor.id, 'Clã')
    expect(await inviteToGroup(group.id, vitor.id, ' ANDRE@example.com ')).toEqual({ ok: true })
    expect(await inviteToGroup(group.id, vitor.id, 'ana@example.com')).toEqual({ ok: true })

    const [mine] = await listGroups(vitor.id)
    expect(mine.members.map((m) => [m.userId, m.user.fullName])).toEqual([[vitor.id, 'Vitor']])
    expect(mine.invites.map((i) => i.email)).toEqual(['andre@example.com', 'ana@example.com'])

    await acceptInvite((await listInvites(andre.email))[0].id, andre)
    const [his] = await listGroups(andre.id)
    expect(his.members.map((m) => m.userId)).toEqual([vitor.id, andre.id])
    expect(his.invites).toEqual([])
  })

  test('only the owner invites; not someone already in it, nor the same e-mail twice', async () => {
    const group = await clan()

    expect(await inviteToGroup(group.id, andre.id, 'ana@example.com')).toEqual({
      ok: false,
      error: 'Só quem criou o grupo convida pessoas.',
    })
    expect(await inviteToGroup(group.id, vitor.id, 'andre@example.com')).toEqual({
      ok: false,
      error: 'Essa pessoa já está no grupo.',
    })
    await inviteToGroup(group.id, vitor.id, 'ana@example.com')
    expect(await inviteToGroup(group.id, vitor.id, 'ana@example.com')).toEqual({
      ok: false,
      error: 'Esse e-mail já tem um convite para o grupo.',
    })
  })

  test(`a group holds up to ${MAX_GROUP_PEOPLE} people, pending invites included`, async () => {
    const group = await clan()
    for (let n = 3; n <= MAX_GROUP_PEOPLE; n++) {
      expect(await inviteToGroup(group.id, vitor.id, `p${n}@example.com`)).toEqual({ ok: true })
    }
    expect(await inviteToGroup(group.id, vitor.id, 'one-more@example.com')).toEqual({
      ok: false,
      error: `O grupo chegou ao limite de ${MAX_GROUP_PEOPLE} pessoas, contando os convites.`,
    })
  })

  test('an invite waits for an e-mail without an account, and the account accepts it later', async () => {
    const group = await insertGroup(vitor.id, 'Clã')
    await inviteToGroup(group.id, vitor.id, 'ana@example.com')

    const ana = await account('ana@example.com')
    expect(await countInvites(ana.email)).toBe(1)
    const [invite] = await listInvites(ana.email)
    expect([invite.group.name, invite.group.owner.fullName]).toEqual(['Clã', 'Vitor'])

    // Not someone else's invite, and only once
    expect(await acceptInvite(invite.id, andre)).toBe(false)
    expect(await acceptInvite(invite.id, ana)).toBe(true)
    expect(await acceptInvite(invite.id, ana)).toBe(false)
    expect(await countInvites(ana.email)).toBe(0)
    expect((await listGroups(ana.id)).map((g) => g.id)).toEqual([group.id])
  })

  test('an account can be in several groups', async () => {
    await clan('Clã')
    const friends = await insertGroup(andre.id, 'Amigos')
    expect((await listGroups(andre.id)).map((g) => g.name)).toEqual(['Amigos', 'Clã'])
    await inviteToGroup(friends.id, andre.id, vitor.email)
    await acceptInvite((await listInvites(vitor.email))[0].id, vitor)
    expect((await listGroups(vitor.id)).map((g) => g.name)).toEqual(['Amigos', 'Clã'])
  })

  test('the invited account declines, the owner cancels, nobody else can', async () => {
    const group = await insertGroup(vitor.id, 'Clã')
    await inviteToGroup(group.id, vitor.id, andre.email)
    await inviteToGroup(group.id, vitor.id, 'ana@example.com')
    const [forAndre] = await listInvites(andre.email)
    const [forAna] = await listInvites('ana@example.com')

    expect(await removeInvite(forAna.id, andre)).toBe(false)
    expect(await removeInvite(forAndre.id, andre)).toBe(true)
    expect(await removeInvite(forAna.id, vitor)).toBe(true)
    expect(await db.groupInvite.count()).toBe(0)
    expect((await listGroups(andre.id)).length).toBe(0)
  })

  test('"Compartilhar com o grupo automaticamente" is per account and group', async () => {
    const group = await clan()
    expect(await setAutoShare(group.id, andre.id, true)).toBe(true)
    const outsider = await account('ana@example.com')
    expect(await setAutoShare(group.id, outsider.id, true)).toBe(false)

    const [his] = await listGroups(andre.id)
    expect(his.members.map((m) => [m.userId, m.autoSharePlans])).toEqual([
      [vitor.id, false],
      [andre.id, true],
    ])
  })

  describe('leaving', () => {
    test('the owner removes someone, an account leaves; the owner does not leave', async () => {
      const group = await clan()
      const ana = await account('ana@example.com')
      await inviteToGroup(group.id, vitor.id, ana.email)
      await acceptInvite((await listInvites(ana.email))[0].id, ana)

      expect(await removeMember(group.id, andre.id, ana.id)).toBe(false)
      expect(await removeMember(group.id, vitor.id, vitor.id)).toBe(false)
      expect(await removeMember(group.id, andre.id, andre.id)).toBe(true)
      expect(await removeMember(group.id, vitor.id, ana.id)).toBe(true)
      expect(await removeMember(group.id, vitor.id, ana.id)).toBe(false)
      expect((await listGroups(vitor.id))[0].members.map((m) => m.userId)).toEqual([vitor.id])
    })

    test('stops the sharing through the group, both ways', async () => {
      const group = await clan()
      const vitorsPlan = await planOf(vitor.id)
      const andresPlan = await planOf(andre.id)
      await sharePlanWithGroup(vitorsPlan.id, vitor.id, group.id)
      await sharePlanWithGroup(andresPlan.id, andre.id, group.id)
      const vitorsOther = await planOf(vitor.id)
      await sharePlan(vitorsOther.id, vitor.id, andre.id)
      const andresOther = await planOf(andre.id)
      await sharePlan(andresOther.id, andre.id, vitor.id)

      await removeMember(group.id, andre.id, andre.id)
      // Vitor's "Todos do grupo" stays, for whoever is in it; André's plans leave the group
      expect(await db.planGroupShare.findMany({ select: { planId: true } })).toEqual([
        { planId: vitorsPlan.id },
      ])
      expect(await db.planShare.count()).toBe(0)
    })

    test('one by one sharing stays while the two still have another group in common', async () => {
      const group = await clan('Clã')
      const friends = await insertGroup(andre.id, 'Amigos')
      await inviteToGroup(friends.id, andre.id, vitor.email)
      await acceptInvite((await listInvites(vitor.email))[0].id, vitor)
      const plan = await planOf(vitor.id)
      await sharePlan(plan.id, vitor.id, andre.id)

      await removeMember(group.id, andre.id, andre.id)
      expect(await db.planShare.count()).toBe(1)
      await removeMember(friends.id, vitor.id, vitor.id)
      expect(await db.planShare.count()).toBe(0)
    })

    test('a plan shared by e-mail before groups, with someone outside, stays', async () => {
      const group = await clan()
      const ana = await account('ana@example.com')
      const plan = await planOf(andre.id)
      await db.planShare.create({ data: { planId: plan.id, userId: ana.id } })

      await removeMember(group.id, andre.id, andre.id)
      expect(await db.planShare.count()).toBe(1)
    })

    test('only the owner deletes the group; its people stop sharing', async () => {
      const group = await clan()
      const plan = await planOf(vitor.id)
      await sharePlanWithGroup(plan.id, vitor.id, group.id)
      await sharePlan(plan.id, vitor.id, andre.id)
      await inviteToGroup(group.id, vitor.id, 'ana@example.com')

      expect(await deleteGroup(group.id, andre.id)).toBe(false)
      expect(await deleteGroup(group.id, vitor.id)).toBe(true)
      expect(await db.group.count()).toBe(0)
      expect(await db.groupMember.count()).toBe(0)
      expect(await db.groupInvite.count()).toBe(0)
      expect(await db.planGroupShare.count()).toBe(0)
      expect(await db.planShare.count()).toBe(0)
    })
  })
})
