import { Prisma } from '@/generated/prisma/client.ts'
import { db } from '@/lib/db'
import type { CalculatorState } from '@/services/calculator/production_planner'

type Tx = Prisma.TransactionClient

/**
 * A saved calculator state with a name, shared by everyone who uses the app.
 * Its targets, buildings, choices and "já tenho" live in plan_items,
 * plan_buildings, plan_choices and plan_owned_items.
 */

const author = { select: { fullName: true, email: true } } as const

/** "Vitor", or the e-mail of an account without a name */
export const authorName = (user: { fullName: string | null; email: string } | null) =>
  user ? (user.fullName ?? user.email) : null

/** The Planos page: the latest change first, with who made it and how many things it has */
export function listPlans() {
  return db.plan.findMany({
    select: {
      id: true,
      name: true,
      updatedAt: true,
      updatedBy: author,
      _count: { select: { items: true, buildings: true } },
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

/** A new plan with its state, in one transaction */
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
    return plan
  })
}

/**
 * Replaces the plan's targets, buildings, choices and owned quantities in
 * one transaction, and marks who changed it. Throws P2025 when the plan is gone.
 */
export function savePlanState(id: number, state: CalculatorState, userId: number | null) {
  return db.$transaction(async (tx) => {
    // First, so a plan deleted meanwhile fails before anything else
    await tx.plan.update({
      where: { id },
      data: {
        ...(state.useInventory !== undefined && { useInventory: state.useInventory }),
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

/** Its rows go with it (cascade). A plan already deleted is not an error */
export function deletePlan(id: number) {
  return db.plan.deleteMany({ where: { id } })
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
