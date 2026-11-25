import { randomBytes } from 'node:crypto'
import { Prisma } from '@/generated/prisma/client.ts'
import { db } from '@/lib/db'

type Tx = Prisma.TransactionClient

/**
 * Accounts that share plans with each other. Any account creates groups and
 * can be in several. Only the owner invites people and removes them. An
 * invite is a link (/invites/[token]) the owner sends: whoever opens it
 * accepts or declines. The app doesn't confirm e-mails, so the invite also
 * shows on the Conta page only of an account that already had that e-mail
 * when invited: signing up with an invited e-mail gives no access. Leaving a
 * group stops the sharing that came through it.
 */

/** People per group, pending invites included */
export const MAX_GROUP_PEOPLE = 50

/** Groups an account creates; being in other people's groups has no limit */
export const MAX_GROUPS_OWNED = 5

const person = { select: { fullName: true, email: true } } as const

/**
 * The groups an account is in, with their people. Pending invites only for
 * the owner: the others don't see e-mails of people who haven't joined.
 */
export async function listGroups(userId: number) {
  const groups = await db.group.findMany({
    where: { members: { some: { userId } } },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      ownerId: true,
      owner: person,
      members: {
        orderBy: { createdAt: 'asc' },
        select: { userId: true, autoSharePlans: true, user: person },
      },
      invites: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, email: true, token: true },
      },
    },
  })
  return groups.map((group) => ({
    ...group,
    invites: group.ownerId === userId ? group.invites : [],
  }))
}

export type GroupWithPeople = Awaited<ReturnType<typeof listGroups>>[number]

export type InsertGroupResult =
  | { group: Awaited<ReturnType<typeof db.group.create>>; error: null }
  | { group: null; error: string }

/** A new group, with its owner already in it, up to MAX_GROUPS_OWNED per account */
export function insertGroup(ownerId: number, name: string) {
  return db.$transaction(async (tx): Promise<InsertGroupResult> => {
    // Locks the account's row: two "Criar grupo" at once can't pass the limit together
    await tx.$queryRaw`SELECT 1 FROM users WHERE id = ${ownerId} FOR UPDATE`
    if ((await tx.group.count({ where: { ownerId } })) >= MAX_GROUPS_OWNED) {
      return { group: null, error: `Você já criou ${MAX_GROUPS_OWNED} grupos, o limite por conta.` }
    }
    const group = await tx.group.create({
      data: { name, ownerId, members: { create: { userId: ownerId } } },
    })
    return { group, error: null }
  })
}

export type InviteResult = { ok: true; token: string } | { ok: false; error: string }

/**
 * The owner invites an e-mail and gets the invite's link to send. An account
 * that already has the e-mail also sees it on the Conta page.
 */
export function inviteToGroup(groupId: number, ownerId: number, email: string) {
  const address = email.trim().toLowerCase()
  return db.$transaction(async (tx): Promise<InviteResult> => {
    // Locks the group's row until the end: two invites at once can't pass the limit together
    const owned = await tx.group.updateMany({
      where: { id: groupId, ownerId },
      data: { updatedAt: new Date() },
    })
    if (!owned.count) return { ok: false, error: 'Só quem criou o grupo convida pessoas.' }
    if (await tx.groupMember.count({ where: { groupId, user: { email: address } } })) {
      return { ok: false, error: 'Essa pessoa já está no grupo.' }
    }
    if (await tx.groupInvite.count({ where: { groupId, email: address } })) {
      return { ok: false, error: 'Esse e-mail já tem um convite para o grupo.' }
    }
    const people =
      (await tx.groupMember.count({ where: { groupId } })) +
      (await tx.groupInvite.count({ where: { groupId } }))
    if (people >= MAX_GROUP_PEOPLE) {
      return {
        ok: false,
        error: `O grupo chegou ao limite de ${MAX_GROUP_PEOPLE} pessoas, contando os convites.`,
      }
    }
    const invitee = await tx.user.findUnique({ where: { email: address }, select: { id: true } })
    const { token } = await tx.groupInvite.create({
      data: {
        groupId,
        email: address,
        token: randomBytes(24).toString('base64url'),
        userId: invitee?.id ?? null,
        invitedById: ownerId,
      },
    })
    return { ok: true, token }
  })
}

/** The invites on an account's Conta page, oldest first */
export function listInvites(userId: number) {
  return db.groupInvite.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { token: true, group: { select: { name: true, owner: person } } },
  })
}

/** How many invites wait on an account's Conta page: the number on the Conta button */
export function countInvites(userId: number) {
  return db.groupInvite.count({ where: { userId } })
}

/** The invite of a link, and whether the account opening it is already in the group */
export function findInvite(token: string, userId: number) {
  return db.groupInvite.findUnique({
    where: { token },
    select: {
      token: true,
      group: {
        select: {
          name: true,
          owner: person,
          members: { where: { userId }, select: { userId: true } },
        },
      },
    },
  })
}

/** The account with the link joins the group. False when the invite is gone */
export function acceptInvite(token: string, userId: number) {
  return db.$transaction(async (tx) => {
    const invite = await tx.groupInvite.findUnique({
      where: { token },
      select: { id: true, groupId: true },
    })
    if (!invite) return false
    // The group's row, like in inviteToGroup: an invite at the same time counts the people after this
    await tx.group.update({ where: { id: invite.groupId }, data: { updatedAt: new Date() } })
    // Two accepts at once: only the one that deletes it goes on
    const { count } = await tx.groupInvite.deleteMany({ where: { id: invite.id } })
    if (!count) return false
    await tx.groupMember.upsert({
      where: { groupId_userId: { groupId: invite.groupId, userId } },
      create: { groupId: invite.groupId, userId },
      update: {},
    })
    return true
  })
}

/** Whoever has the link declines it. False when it was gone */
export async function declineInvite(token: string) {
  const { count } = await db.groupInvite.deleteMany({ where: { token } })
  return count > 0
}

/** The owner cancels an invite of its group. False when there was nothing to do */
export async function cancelInvite(inviteId: number, ownerId: number) {
  const { count } = await db.groupInvite.deleteMany({
    where: { id: inviteId, group: { ownerId } },
  })
  return count > 0
}

/** Whether the account's new plans already start shared with the group */
export async function setAutoShare(groupId: number, userId: number, on: boolean) {
  const { count } = await db.groupMember.updateMany({
    where: { groupId, userId },
    data: { autoSharePlans: on },
  })
  return count > 0
}

/**
 * Takes an account out of a group: the owner removes anyone else, and an
 * account leaves a group it is in. The owner doesn't leave: it deletes the
 * group. The account's plans stop being shared with the group, and so do the
 * plans shared one by one between it and the group's people (see
 * stopSharingApart). False when there was nothing to do.
 */
export async function removeMember(groupId: number, actorId: number, userId: number) {
  const group = await db.group.findUnique({ where: { id: groupId }, select: { ownerId: true } })
  if (!group || userId === group.ownerId) return false
  if (actorId !== userId && actorId !== group.ownerId) return false
  return db.$transaction(async (tx) => {
    const { count } = await tx.groupMember.deleteMany({ where: { groupId, userId } })
    if (!count) return false
    await tx.planGroupShare.deleteMany({ where: { groupId, plan: { createdById: userId } } })
    const others = await tx.groupMember.findMany({ where: { groupId }, select: { userId: true } })
    await stopSharingApart(tx, [userId, ...others.map((member) => member.userId)])
    return true
  })
}

/**
 * Only the owner deletes a group: its people, invites and "Todos do grupo"
 * go with it (cascade), and so do the plans shared one by one between its
 * people (see stopSharingApart). False when there was nothing to do.
 */
export function deleteGroup(groupId: number, ownerId: number) {
  return db.$transaction(async (tx) => {
    const members = await tx.groupMember.findMany({
      where: { groupId, group: { ownerId } },
      select: { userId: true },
    })
    const { count } = await tx.group.deleteMany({ where: { id: groupId, ownerId } })
    if (count)
      await stopSharingApart(
        tx,
        members.map((member) => member.userId)
      )
    return count > 0
  })
}

/**
 * Accounts that just lost a group in common: the plans shared one by one
 * between two of them stop, unless those two still have another group in
 * common. Shares with anyone outside the list (like the ones made by e-mail
 * before groups existed) stay.
 */
async function stopSharingApart(tx: Tx, userIds: number[]) {
  const rows = await tx.groupMember.findMany({
    where: { userId: { in: userIds } },
    select: { groupId: true, userId: true },
  })
  const groupsOf = new Map<number, Set<number>>(userIds.map((id) => [id, new Set()]))
  for (const row of rows) groupsOf.get(row.userId)!.add(row.groupId)
  const together = (a: number, b: number) =>
    [...groupsOf.get(a)!].some((groupId) => groupsOf.get(b)!.has(groupId))

  const apart = userIds
    .map((ownerId) => ({
      plan: { createdById: ownerId },
      userId: { in: userIds.filter((other) => other !== ownerId && !together(ownerId, other)) },
    }))
    .filter((pair) => pair.userId.in.length > 0)
  if (apart.length) await tx.planShare.deleteMany({ where: { OR: apart } })
}
