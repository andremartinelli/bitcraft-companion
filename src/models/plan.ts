import { Prisma } from '@/generated/prisma/client.ts'
import { db } from '@/lib/db'
import type { CalculatorState } from '@/services/calculator/production_planner'

type Tx = Prisma.TransactionClient

/**
 * A saved calculator state with a name. It belongs to the account that
 * created it (created_by_id), which shares it with its groups (models/group):
 * with a whole group (plan_group_shares, "Todos do grupo", which also reaches
 * whoever joins later) or one person at a time (plan_shares). They see and
 * change it, only the owner deletes it. Its targets, buildings, choices and
 * "já tenho" live in plan_items, plan_buildings, plan_choices and
 * plan_owned_items.
 */

const author = { select: { fullName: true, email: true } } as const

/** "Vitor", or the e-mail of an account without a name */
export const authorName = (user: { fullName: string | null; email: string } | null) =>
  user ? (user.fullName ?? user.email) : null

/** Plans an account can open: its own, the ones shared with it and with its groups */
const visibleTo = (userId: number) => ({
  OR: [
    { createdById: userId },
    { shares: { some: { userId } } },
    { groupShares: { some: { group: { members: { some: { userId } } } } } },
  ],
})

/** The Planos page: the latest change first, with who made it and how many things it has */
export function listPlans(userId: number) {
  return db.plan.findMany({
    where: visibleTo(userId),
    select: {
      id: true,
      name: true,
      updatedAt: true,
      createdById: true,
      createdBy: author,
      updatedBy: author,
      _count: { select: { items: true, buildings: true, shares: true, groupShares: true } },
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
  })
}

/** A plan with everything its calculator needs; null when there is none */
export function findPlan(id: number) {
  return db.plan.findUnique({
    where: { id },
    include: {
      items: { orderBy: { position: 'asc' } },
      buildings: { orderBy: { position: 'asc' } },
      choices: true,
      ownedItems: true,
      updatedBy: author,
    },
  })
}

/**
 * A plan an account can open, with who owns it and who it is shared with
 * (and, per group, whether the account is in it); null when there is none or
 * it is someone else's
 */
export function findPlanFor(id: number, userId: number) {
  return db.plan.findFirst({
    where: { id, ...visibleTo(userId) },
    include: {
      items: { orderBy: { position: 'asc' } },
      buildings: { orderBy: { position: 'asc' } },
      choices: true,
      ownedItems: true,
      updatedBy: author,
      createdBy: author,
      shares: {
        orderBy: { createdAt: 'asc' },
        select: { userId: true, user: author },
      },
      groupShares: {
        select: {
          groupId: true,
          group: {
            select: { name: true, members: { where: { userId }, select: { userId: true } } },
          },
        },
      },
    },
  })
}

/** The account can change the plan: it owns it, or it was shared with it */
export async function canEditPlan(id: number, userId: number) {
  return (await db.plan.count({ where: { id, ...visibleTo(userId) } })) > 0
}

/**
 * The owner shares the plan with one account of a group it is in. False when
 * it is not the owner's plan, or they have no group in common.
 */
export async function sharePlan(planId: number, ownerId: number, userId: number) {
  if (userId === ownerId) return false
  return db.$transaction(async (tx) => {
    if (!(await tx.plan.count({ where: { id: planId, createdById: ownerId } }))) return false
    // Locked, like in sharePlanWithGroup: both memberships in every group they have in common
    const together = await tx.$queryRaw<unknown[]>`
      SELECT 1 FROM group_members mine
      JOIN group_members theirs ON theirs.group_id = mine.group_id
      WHERE mine.user_id = ${ownerId} AND theirs.user_id = ${userId}
      FOR SHARE`
    if (!together.length) return false
    await tx.planShare.upsert({
      where: { planId_userId: { planId, userId } },
      create: { planId, userId },
      update: {},
    })
    return true
  })
}

/**
 * The owner shares the plan with a whole group it is in ("Todos do grupo"),
 * which also reaches whoever joins later. False when it can't.
 */
export function sharePlanWithGroup(planId: number, ownerId: number, groupId: number) {
  return db.$transaction(async (tx) => {
    if (!(await tx.plan.count({ where: { id: planId, createdById: ownerId } }))) return false
    // The membership stays locked until the share is saved: leaving the group at the same
    // time waits for it, and its cleanup (models/group removeMember) then sees the share
    const member = await tx.$queryRaw<unknown[]>`
      SELECT 1 FROM group_members WHERE group_id = ${groupId} AND user_id = ${ownerId}
      FOR SHARE`
    if (!member.length) return false
    await tx.planGroupShare.upsert({
      where: { planId_groupId: { planId, groupId } },
      create: { planId, groupId },
      update: {},
    })
    return true
  })
}

/** The owner stops sharing the plan with a whole group. False when there was nothing to do */
export async function removePlanGroupShare(planId: number, ownerId: number, groupId: number) {
  const { count } = await db.planGroupShare.deleteMany({
    where: { planId, groupId, plan: { createdById: ownerId } },
  })
  return count > 0
}

/**
 * Takes an account out of a shared plan: the owner removes anyone, and an
 * account can leave a plan shared with it. False when there was nothing to do.
 */
export async function removePlanShare(planId: number, actorId: number, userId: number) {
  const allowed =
    actorId === userId || (await db.plan.count({ where: { id: planId, createdById: actorId } })) > 0
  if (!allowed) return false
  const { count } = await db.planShare.deleteMany({ where: { planId, userId } })
  return count > 0
}

export type PlanWithState = NonNullable<Awaited<ReturnType<typeof findPlan>>>

/** The plan as the calculator's state */
export function toCalculatorState(
  plan: Pick<PlanWithState, 'items' | 'buildings' | 'choices' | 'ownedItems' | 'useInventory'>
): CalculatorState {
  const choices: CalculatorState['choices'] = {}
  for (const choice of plan.choices) choices[choice.itemId] = choice.recipeId ?? 'raw'
  const owned: CalculatorState['owned'] = {}
  for (const entry of plan.ownedItems) owned[entry.itemId] = entry.quantity

  return {
    targets: plan.items.map((item) => ({ itemId: item.itemId, quantity: item.quantity })),
    buildings: plan.buildings.map((building) => ({
      recipeId: building.recipeId,
      quantity: building.quantity,
    })),
    choices,
    owned,
    useInventory: plan.useInventory,
  }
}

/**
 * A new plan with its state, in one transaction, already shared with the
 * groups where the account turned on "Compartilhar com o grupo automaticamente"
 */
export function insertPlan({
  name,
  notes = null,
  state,
  userId,
}: {
  name: string
  notes?: string | null
  state: CalculatorState
  userId: number | null
}) {
  return db.$transaction(async (tx) => {
    const plan = await tx.plan.create({
      data: {
        name,
        notes,
        useInventory: state.useInventory ?? true,
        createdById: userId,
        updatedById: userId,
      },
    })
    await writeState(tx, plan.id, state)
    if (userId !== null) {
      // Locked, like in sharePlanWithGroup
      const groups = await tx.$queryRaw<{ group_id: number }[]>`
        SELECT group_id FROM group_members WHERE user_id = ${userId} AND auto_share_plans
        FOR SHARE`
      await tx.planGroupShare.createMany({
        data: groups.map((group) => ({ planId: plan.id, groupId: group.group_id })),
      })
    }
    return plan
  })
}

/**
 * Replaces the plan's targets, buildings, choices and owned quantities (and,
 * when given, its notes) in one transaction, and marks who changed it.
 * Throws P2025 when the plan is gone.
 */
export function savePlanState(
  id: number,
  state: CalculatorState,
  userId: number | null,
  notes?: string
) {
  return db.$transaction(async (tx) => {
    // First, so a plan deleted meanwhile fails before anything else
    await tx.plan.update({
      where: { id },
      data: {
        ...(state.useInventory !== undefined && { useInventory: state.useInventory }),
        ...(notes !== undefined && { notes }),
        updatedById: userId,
        // Also when only the rows below changed
        updatedAt: new Date(),
      },
    })
    await writeState(tx, id, state)
  })
}

/** Throws P2025 when the plan is gone */
export function updatePlanName(id: number, name: string, userId: number | null) {
  return db.plan.update({ where: { id }, data: { name, updatedById: userId } })
}

/**
 * Only the owner deletes a plan; its rows and shares go with it (cascade).
 * A plan already deleted is not an error.
 */
export function deletePlan(id: number, ownerId: number) {
  return db.plan.deleteMany({ where: { id, createdById: ownerId } })
}

/**
 * Why a save failed, as the page says it: the plan was deleted meanwhile, or
 * the state names an item or recipe that doesn't exist. Null for anything
 * else, which is a bug and should go up.
 */
export function saveErrorMessage(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null
  if (error.code === 'P2025') return 'Este plano não existe mais. Ele pode ter sido apagado.'
  if (error.code === 'P2003') return 'Alguns dados do cálculo são inválidos.'
  return null
}

/** Repeated targets (and buildings) are merged; positions keep the order */
async function writeState(tx: Tx, planId: number, state: CalculatorState) {
  const targets = new Map<number, number>()
  for (const t of state.targets) targets.set(t.itemId, (targets.get(t.itemId) ?? 0) + t.quantity)
  const buildings = new Map<number, number>()
  for (const b of state.buildings ?? []) {
    buildings.set(b.recipeId, (buildings.get(b.recipeId) ?? 0) + b.quantity)
  }

  const where = { where: { planId } }
  await tx.planItem.deleteMany(where)
  await tx.planBuilding.deleteMany(where)
  await tx.planChoice.deleteMany(where)
  await tx.planOwnedItem.deleteMany(where)

  await tx.planItem.createMany({
    data: [...targets].map(([itemId, quantity], position) => ({
      planId,
      itemId,
      quantity,
      position,
    })),
  })
  await tx.planBuilding.createMany({
    data: [...buildings].map(([recipeId, quantity], position) => ({
      planId,
      recipeId,
      quantity,
      position,
    })),
  })
  await tx.planChoice.createMany({
    data: Object.entries(state.choices).map(([itemId, choice]) => ({
      planId,
      itemId: Number(itemId),
      recipeId: choice === 'raw' ? null : choice,
    })),
  })
  await tx.planOwnedItem.createMany({
    data: Object.entries(state.owned).map(([itemId, quantity]) => ({
      planId,
      itemId: Number(itemId),
      quantity,
    })),
  })
}
