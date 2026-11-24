import { beforeEach, describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import {
  authorName,
  canEditPlan,
  deletePlan,
  findPlanFor,
  removePlanShare,
  sharePlan,
  findPlan,
  insertPlan,
  listPlans,
  saveErrorMessage,
  savePlanState,
  toCalculatorState,
  updatePlanName,
} from '@/models/plan'
import { createUser } from '@/services/auth/create_user'
import { calculate } from '@/services/calculator/calculate'
import { emptyState } from '@/services/calculator/state_params'
import { fixtureTables, importTables } from '../../helpers/game_data'

const itemId = async (gameId: number) =>
  (await db.item.findUniqueOrThrow({ where: { kind_gameId: { kind: 'item', gameId } } })).id

const loaded = async (id: number) => toCalculatorState((await findPlan(id))!)

describe('plans', () => {
  let userId: number
  let plank: number

  beforeEach(async () => {
    await importTables()
    const user = await createUser({
      email: 'vitor@example.com',
      fullName: 'Vitor',
      password: 'a-long-enough-password',
    })
    userId = user.id
    plank = await itemId(1030)
  })

  const planWithPlanks = (quantity = 10) =>
    insertPlan({
      name: 'Ferramentas T2',
      userId,
      state: { ...emptyState(), targets: [{ itemId: plank, quantity }] },
    })

  test('a new plan keeps its state and who made it', async () => {
    const plan = await planWithPlanks()

    expect(await loaded(plan.id)).toEqual({
      ...emptyState(),
      targets: [{ itemId: plank, quantity: 10 }],
    })
    const [listed] = await listPlans(userId)
    expect([listed.name, listed._count.items, authorName(listed.updatedBy)]).toEqual([
      'Ferramentas T2',
      1,
      'Vitor',
    ])
  })

  test('"Novo plano": an empty plan', async () => {
    const plan = await insertPlan({ name: 'Novo plano', userId, state: emptyState() })

    expect(await loaded(plan.id)).toEqual(emptyState())
  })

  test('saving replaces quantity, buildings, choices and owned', async () => {
    const plan = await planWithPlanks()
    const stripped = await itemId(1020)
    const house = await db.recipe.findUniqueOrThrow({
      where: { kind_gameId: { kind: 'construction', gameId: 50 } },
    })
    const state = {
      targets: [{ itemId: plank, quantity: 4 }],
      buildings: [{ recipeId: house.id, quantity: 1 }],
      choices: { [stripped]: 'raw' as const },
      owned: { [stripped]: 3 },
      useInventory: false,
    }

    await savePlanState(plan.id, state, userId)
    expect(await loaded(plan.id)).toEqual(state)

    await savePlanState(plan.id, { ...state, buildings: [] }, userId)
    expect((await loaded(plan.id)).buildings).toEqual([])
  })

  test('repeated targets are merged, in their order', async () => {
    const plan = await planWithPlanks()
    const stripped = await itemId(1020)

    await savePlanState(
      plan.id,
      {
        ...emptyState(),
        targets: [
          { itemId: stripped, quantity: 1 },
          { itemId: plank, quantity: 2 },
          { itemId: stripped, quantity: 5 },
        ],
      },
      userId
    )
    expect((await loaded(plan.id)).targets).toEqual([
      { itemId: stripped, quantity: 6 },
      { itemId: plank, quantity: 2 },
    ])
  })

  test('the latest change comes first in the list', async () => {
    const first = await planWithPlanks()
    const second = await insertPlan({ name: 'Outro', userId, state: emptyState() })
    expect((await listPlans(userId)).map((p) => p.id)).toEqual([second.id, first.id])

    await savePlanState(first.id, { ...emptyState(), targets: [] }, userId)
    expect((await listPlans(userId)).map((p) => p.id)).toEqual([first.id, second.id])
  })

  test('renaming keeps the calculation', async () => {
    const plan = await planWithPlanks()
    await updatePlanName(plan.id, 'Ferramentas T3', userId)

    const saved = await findPlan(plan.id)
    expect(saved!.name).toBe('Ferramentas T3')
    expect(saved!.items).toHaveLength(1)
  })

  test('deleting takes its rows along; deleting again is not an error', async () => {
    const plan = await planWithPlanks()
    await deletePlan(plan.id, userId)
    await deletePlan(plan.id, userId)

    expect(await findPlan(plan.id)).toBeNull()
    expect(await db.planItem.count()).toBe(0)
  })

  test('a plan deleted meanwhile, or an id that does not exist, says so', async () => {
    const plan = await planWithPlanks()
    await deletePlan(plan.id, userId)

    const gone = await savePlanState(plan.id, emptyState(), userId).catch((e: unknown) => e)
    expect(saveErrorMessage(gone)).toBe('Este plano não existe mais. Ele pode ter sido apagado.')

    const other = await planWithPlanks()
    const unknown = await savePlanState(
      other.id,
      { ...emptyState(), targets: [{ itemId: 999_999, quantity: 1 }] },
      userId
    ).catch((e: unknown) => e)
    expect(saveErrorMessage(unknown)).toBe('Alguns dados do cálculo são inválidos.')
    // Nothing of it was saved
    expect((await loaded(other.id)).targets).toEqual([{ itemId: plank, quantity: 10 }])
    expect(saveErrorMessage(new Error('bug'))).toBeNull()
  })

  test('a saved choice for a recipe that left the game falls back with a warning', async () => {
    const stripped = await itemId(1020)
    const saw = await db.recipe.findUniqueOrThrow({
      where: { kind_gameId: { kind: 'crafting', gameId: 101 } },
    })
    const plan = await insertPlan({
      name: 'Pranchas',
      userId,
      state: {
        ...emptyState(),
        targets: [{ itemId: plank, quantity: 10 }],
        choices: { [stripped]: saw.id },
      },
    })
    const tables = fixtureTables()
    tables.crafting_recipe_desc = tables.crafting_recipe_desc.filter(
      (row: { id: number }) => row.id !== 101
    )
    await importTables(tables)

    const panel = await calculate(await loaded(plan.id), userId)
    expect(panel.warnings.join(' ')).toContain('não existe mais ou não produz esse item')
  })

  test('a target that left the game is marked, not an error', async () => {
    const plan = await planWithPlanks()
    const tables = fixtureTables()
    tables.item_desc = tables.item_desc.filter((row: { id: number }) => row.id !== 1030)
    await importTables(tables)

    const panel = await calculate(await loaded(plan.id), userId)
    expect(panel.targets.map((t) => [t.item.name, t.item.removed])).toEqual([['Rough Plank', true]])
  })

  describe('each account has its own, and the owner shares', () => {
    let otherId: number

    beforeEach(async () => {
      otherId = (
        await createUser({
          email: 'andre@example.com',
          fullName: 'André',
          password: 'a-long-enough-password',
        })
      ).id
    })

    test("another account doesn't see, open, change or delete someone else's plan", async () => {
      const plan = await planWithPlanks()

      expect(await listPlans(otherId)).toEqual([])
      expect(await findPlanFor(plan.id, otherId)).toBeNull()
      expect(await canEditPlan(plan.id, otherId)).toBe(false)
      expect((await deletePlan(plan.id, otherId)).count).toBe(0)
      expect(await findPlan(plan.id)).not.toBeNull()
    })

    test('shared by e-mail: the other account sees and changes it, but does not delete it', async () => {
      const plan = await planWithPlanks()

      expect(await sharePlan(plan.id, userId, ' ANDRE@example.com ')).toEqual({
        ok: true,
        name: 'André',
      })
      // Sharing twice changes nothing
      expect((await sharePlan(plan.id, userId, 'andre@example.com')).ok).toBe(true)

      const [listed] = await listPlans(otherId)
      expect([listed.id, listed.createdById, authorName(listed.createdBy)]).toEqual([
        plan.id,
        userId,
        'Vitor',
      ])
      expect(await canEditPlan(plan.id, otherId)).toBe(true)
      const opened = await findPlanFor(plan.id, otherId)
      expect(opened!.shares.map((share) => share.userId)).toEqual([otherId])
      expect((await deletePlan(plan.id, otherId)).count).toBe(0)
    })

    test('only the owner shares; not with itself, nor with an e-mail without an account', async () => {
      const plan = await planWithPlanks()

      expect(await sharePlan(plan.id, otherId, 'vitor@example.com')).toEqual({
        ok: false,
        error: 'Só quem criou o plano pode compartilhá-lo.',
      })
      expect(await sharePlan(plan.id, userId, 'vitor@example.com')).toEqual({
        ok: false,
        error: 'O plano já é seu.',
      })
      expect(await sharePlan(plan.id, userId, 'ninguem@example.com')).toEqual({
        ok: false,
        error: 'Nenhuma conta com esse e-mail.',
      })
    })

    test('the owner takes an account out; an account can leave; nobody else can', async () => {
      const plan = await planWithPlanks()
      const third = await createUser({ email: 'c@example.com', password: 'a-long-enough-password' })
      await sharePlan(plan.id, userId, 'andre@example.com')
      await sharePlan(plan.id, userId, 'c@example.com')

      // The third account cannot take André out
      expect(await removePlanShare(plan.id, third.id, otherId)).toBe(false)
      // André leaves; the owner takes the third one out
      expect(await removePlanShare(plan.id, otherId, otherId)).toBe(true)
      expect(await removePlanShare(plan.id, userId, third.id)).toBe(true)
      expect(await listPlans(otherId)).toEqual([])
      expect(await db.planShare.count()).toBe(0)
    })

    test('deleting the plan takes its shares along', async () => {
      const plan = await planWithPlanks()
      await sharePlan(plan.id, userId, 'andre@example.com')

      await deletePlan(plan.id, userId)
      expect(await db.planShare.count()).toBe(0)
    })
  })
})
