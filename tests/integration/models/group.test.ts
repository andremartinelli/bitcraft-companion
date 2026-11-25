import { beforeEach, describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import {
  acceptInvite,
  cancelInvite,
  countInvites,
  declineInvite,
  deleteGroup,
  findInvite,
  insertGroup,
  inviteToGroup,
  listGroups,
  listInvites,
  MAX_GROUP_PEOPLE,
  MAX_GROUPS_OWNED,
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

/** The token of the link of a new invite */
const linkFor = async (groupId: number, ownerId: number, email: string) => {
  const result = await inviteToGroup(groupId, ownerId, email)
  if (!result.ok) throw new Error(result.error)
  return result.token
}

describe('groups', () => {
  let vitor: { id: number; email: string }
  let andre: { id: number; email: string }

  beforeEach(async () => {
    vitor = await account('vitor@example.com', 'Vitor')
    andre = await account('andre@example.com', 'André')
  })

  /** Vitor's group with André in it, through the invite */
  const clan = async (name = 'Clã') => {
    const group = (await insertGroup(vitor.id, name)).group!
    await acceptInvite(await linkFor(group.id, vitor.id, andre.email), andre.id)
    return group
  }

  test('the owner is in the group it creates; pending invites only show to the owner', async () => {
    const group = (await insertGroup(vitor.id, 'Clã')).group!
    expect(await inviteToGroup(group.id, vitor.id, ' ANDRE@example.com ')).toEqual({
      ok: true,
      token: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/),
    })
    await linkFor(group.id, vitor.id, 'ana@example.com')

    const [mine] = await listGroups(vitor.id)
    expect(mine.members.map((m) => [m.userId, m.user.fullName])).toEqual([[vitor.id, 'Vitor']])
    expect(mine.invites.map((i) => i.email)).toEqual(['andre@example.com', 'ana@example.com'])

    await acceptInvite(mine.invites[0].token, andre.id)
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
      expect((await inviteToGroup(group.id, vitor.id, `p${n}@example.com`)).ok).toBe(true)
    }
    expect(await inviteToGroup(group.id, vitor.id, 'one-more@example.com')).toEqual({
      ok: false,
      error: `O grupo chegou ao limite de ${MAX_GROUP_PEOPLE} pessoas, contando os convites.`,
    })
  })

  test('signing up with an invited e-mail gives nothing; whoever has the link joins', async () => {
    const group = (await insertGroup(vitor.id, 'Clã')).group!
    const token = await linkFor(group.id, vitor.id, 'ana@example.com')

    // Someone else signs up with that e-mail first: no invite for them
    const squatter = await account('ana@example.com')
    expect(await countInvites(squatter.id)).toBe(0)
    expect(await listInvites(squatter.id)).toEqual([])

    // The real Ana opens the link, with an account of another e-mail
    const ana = await account('ana.real@example.com')
    const invite = await findInvite(token, ana.id)
    expect([invite!.group.name, invite!.group.owner.fullName, invite!.group.members]).toEqual([
      'Clã',
      'Vitor',
      [],
    ])
    expect(await acceptInvite('not-the-token', ana.id)).toBe(false)
    expect(await acceptInvite(token, ana.id)).toBe(true)
    expect(await acceptInvite(token, ana.id)).toBe(false)
    expect(await findInvite(token, ana.id)).toBeNull()
    expect((await listGroups(ana.id)).map((g) => g.id)).toEqual([group.id])
    expect(await listGroups(squatter.id)).toEqual([])
  })

  test('an account that already had the e-mail also sees the invite on Conta', async () => {
    const group = (await insertGroup(vitor.id, 'Clã')).group!
    const token = await linkFor(group.id, vitor.id, andre.email)

    expect(await countInvites(andre.id)).toBe(1)
    const [invite] = await listInvites(andre.id)
    expect([invite.token, invite.group.name, invite.group.owner.fullName]).toEqual([
      token,
      'Clã',
      'Vitor',
    ])
    expect((await findInvite(token, vitor.id))!.group.members).toEqual([{ userId: vitor.id }])
  })

  test('an account can be in several groups', async () => {
    await clan('Clã')
    const friends = (await insertGroup(andre.id, 'Amigos')).group!
    expect((await listGroups(andre.id)).map((g) => g.name)).toEqual(['Amigos', 'Clã'])
    await acceptInvite(await linkFor(friends.id, andre.id, vitor.email), vitor.id)
    expect((await listGroups(vitor.id)).map((g) => g.name)).toEqual(['Amigos', 'Clã'])
  })

  test(`an account creates up to ${MAX_GROUPS_OWNED} groups, and is in others' groups too`, async () => {
    await clan()
    for (let n = 2; n <= MAX_GROUPS_OWNED; n++) {
      expect((await insertGroup(vitor.id, `G${n}`)).error).toBeNull()
    }
    expect(await insertGroup(vitor.id, 'Mais um')).toEqual({
      group: null,
      error: `Você já criou ${MAX_GROUPS_OWNED} grupos, o limite por conta.`,
    })
    // André is in Vitor's group and still creates his own
    expect((await insertGroup(andre.id, 'Amigos')).error).toBeNull()
  })

  test('whoever has the link declines it; only the owner cancels one', async () => {
    const group = (await insertGroup(vitor.id, 'Clã')).group!
    const forAndre = await linkFor(group.id, vitor.id, andre.email)
    await linkFor(group.id, vitor.id, 'ana@example.com')
    const forAna = (await listGroups(vitor.id))[0].invites[1]

    expect(await declineInvite('not-the-token')).toBe(false)
    expect(await declineInvite(forAndre)).toBe(true)
    expect(await cancelInvite(forAna.id, andre.id)).toBe(false)
    expect(await cancelInvite(forAna.id, vitor.id)).toBe(true)
    expect(await db.groupInvite.count()).toBe(0)
    expect(await listGroups(andre.id)).toEqual([])
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
      await acceptInvite(await linkFor(group.id, vitor.id, ana.email), ana.id)

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
      const friends = (await insertGroup(andre.id, 'Amigos')).group!
      await acceptInvite(await linkFor(friends.id, andre.id, vitor.email), vitor.id)
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

    /**
     * Runs `share` while André is leaving the group (his membership deleted,
     * not committed yet), and returns what it answered
     */
    const whileLeaving = async (groupId: number, share: () => Promise<boolean>) => {
      let release!: () => void
      const held = new Promise<void>((resolve) => (release = resolve))
      let deleted!: () => void
      const gone = new Promise<void>((resolve) => (deleted = resolve))
      const leaving = db.$transaction(async (tx) => {
        await tx.groupMember.deleteMany({ where: { groupId, userId: andre.id } })
        deleted()
        await held
      })
      await gone
      const sharing = share()
      await new Promise((resolve) => setTimeout(resolve, 300))
      release()
      await leaving
      return sharing
    }

    test('sharing while leaving at the same time waits, and is refused', async () => {
      const group = await clan()
      const plan = await planOf(andre.id)
      expect(
        await whileLeaving(group.id, () => sharePlanWithGroup(plan.id, andre.id, group.id))
      ).toBe(false)
      expect(await whileLeaving(group.id, () => sharePlan(plan.id, andre.id, vitor.id))).toBe(false)
      expect(await db.planGroupShare.count()).toBe(0)
      expect(await db.planShare.count()).toBe(0)
    })

    test('a new plan does not start shared with a group its owner is leaving', async () => {
      const group = await clan()
      await setAutoShare(group.id, andre.id, true)
      await whileLeaving(group.id, async () => {
        await planOf(andre.id)
        return true
      })
      expect(await db.planGroupShare.count()).toBe(0)
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
