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

import { refresh } from 'next/cache'
import { createPlan, createQuickPlan, destroyPlan, updatePlan } from '@/app/(app)/plans/actions'
import { db } from '@/lib/db'
import { findPlan, insertPlan, toCalculatorState } from '@/models/plan'
import { createUser } from '@/services/auth/create_user'
import { createSessionToken } from '@/services/auth/session_token'
import { emptyState } from '@/services/calculator/state_params'
import { importTables, withSetsAndTools } from '../../helpers/game_data'

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

const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

const NO_ERROR = { error: null }

describe('plan actions', () => {
  let userId: number
  let plank: number

  beforeEach(async () => {
    await importTables(withSetsAndTools())
    const user = await createUser({
      email: 'vitor@example.com',
      fullName: 'Vitor',
      password: 'a-long-enough-password',
    })
    userId = user.id
    request.token = await createSessionToken(user.id)
    plank = (
      await db.item.findUniqueOrThrow({ where: { kind_gameId: { kind: 'item', gameId: 1030 } } })
    ).id
    vi.mocked(refresh).mockClear()
  })

  const planWithPlanks = () =>
    insertPlan({
      name: 'Ferramentas T2',
      userId,
      state: { ...emptyState(), targets: [{ itemId: plank, quantity: 10 }] },
    })

  test('every action asks for the login first', async () => {
    const plan = await planWithPlanks()
    request.token = undefined

    expect(await redirectedTo(createPlan(NO_ERROR, form({ name: 'X' })))).toBe('/login')
    expect(await redirectedTo(updatePlan(plan.id, { name: 'X' }))).toBe('/login')
    expect(await redirectedTo(destroyPlan(plan.id))).toBe('/login')
    expect(await redirectedTo(createQuickPlan({ template: 'tools', tier: 1 }))).toBe('/login')
    expect((await findPlan(plan.id))!.name).toBe('Ferramentas T2')
    expect(await db.plan.count()).toBe(1)
  })

  test('"Salvar como plano" creates the plan with the calculator state and opens it', async () => {
    const to = await redirectedTo(
      createPlan(NO_ERROR, form({ name: ' Pranchas ', state: `t=${plank}x10&inv=0` }))
    )

    const plan = await db.plan.findFirstOrThrow({ where: { name: 'Pranchas' } })
    expect(to).toBe(`/plans/${plan.id}`)
    expect(plan.createdById).toBe(userId)
    expect(toCalculatorState((await findPlan(plan.id))!)).toEqual({
      ...emptyState(),
      targets: [{ itemId: plank, quantity: 10 }],
      useInventory: false,
    })
  })

  test('"Novo plano" creates an empty plan and opens it', async () => {
    const to = await redirectedTo(createPlan(NO_ERROR, form({ name: 'Novo plano' })))

    const plan = await findPlan(Number(to.split('/').at(-1)))
    expect([plan!.name, plan!.items.length, plan!.buildings.length]).toEqual(['Novo plano', 0, 0])
  })

  test('a blank name or an invalid state creates nothing and says why', async () => {
    expect(await createPlan(NO_ERROR, form({ name: '   ' }))).toEqual({
      error: 'Dê ao plano um nome de até 80 caracteres.',
      name: '   ',
    })
    expect(await createPlan(NO_ERROR, form({ name: 'P', state: `t=${plank}x0` }))).toEqual({
      error: 'A quantidade precisa ser um número inteiro entre 1 e 100.000.',
      name: 'P',
    })
    expect(await createPlan(NO_ERROR, form({ name: 'P', state: 't=999999x1' }))).toEqual({
      error: 'Alguns dados do cálculo são inválidos.',
      name: 'P',
    })
    expect(await db.plan.count()).toBe(0)
  })

  test('a change in the calculator is saved, by whoever made it', async () => {
    const plan = await planWithPlanks()
    const state = { ...emptyState(), targets: [{ itemId: plank, quantity: 4 }] }

    expect(await updatePlan(plan.id, { state })).toEqual({ errors: [] })
    expect(refresh).toHaveBeenCalledOnce()
    const saved = await findPlan(plan.id)
    expect(toCalculatorState(saved!)).toEqual(state)
    expect(saved!.updatedById).toBe(userId)
  })

  test('an invalid state saves nothing and comes back as messages', async () => {
    const plan = await planWithPlanks()

    const result = await updatePlan(plan.id, {
      state: { ...emptyState(), targets: [{ itemId: plank, quantity: 0 }] },
    })
    expect(result).toEqual({
      errors: ['A quantidade precisa ser um número inteiro entre 1 e 100.000.'],
    })
    expect(await updatePlan(plan.id, 'nonsense')).toEqual({
      errors: ['Alguns dados do plano são inválidos.'],
    })
    expect(refresh).not.toHaveBeenCalled()
    expect(toCalculatorState((await findPlan(plan.id))!).targets).toEqual([
      { itemId: plank, quantity: 10 },
    ])
  })

  test('renaming keeps the calculation; a blank name is refused', async () => {
    const plan = await planWithPlanks()

    expect(await updatePlan(plan.id, { name: 'Ferramentas T3' })).toEqual({ errors: [] })
    expect(await updatePlan(plan.id, { name: '' })).toEqual({
      errors: ['Dê ao plano um nome de até 80 caracteres.'],
    })
    const saved = await findPlan(plan.id)
    expect([saved!.name, saved!.items.length]).toEqual(['Ferramentas T3', 1])
  })

  test('a plan deleted meanwhile says so', async () => {
    const plan = await planWithPlanks()
    await redirectedTo(destroyPlan(plan.id))

    expect(await updatePlan(plan.id, { state: emptyState() })).toEqual({
      errors: ['Este plano não existe mais. Ele pode ter sido apagado.'],
    })
  })

  test('deleting goes back to the list', async () => {
    const plan = await planWithPlanks()

    expect(await redirectedTo(destroyPlan(plan.id))).toBe('/plans')
    expect(await findPlan(plan.id)).toBeNull()
  })

  test('a quick plan opens the new plan with the whole set', async () => {
    const to = await redirectedTo(createQuickPlan({ template: 'tools', tier: 1 }))

    const plan = await db.plan.findFirstOrThrow({ include: { items: true } })
    expect(to).toBe(`/plans/${plan.id}`)
    expect([plan.name, plan.items.length, plan.createdById]).toEqual(['Ferramentas T1', 3, userId])
  })

  test('the metal set keeps the chosen style', async () => {
    await redirectedTo(createQuickPlan({ template: 'metal', tier: 2, style: 'Plated' }))

    const plan = await db.plan.findFirstOrThrow({ include: { items: true } })
    expect([plan.name, plan.items.length]).toEqual(['Set de minério Plated T2', 2])
  })

  test('a tier with none of the items says so; an unknown set is refused', async () => {
    expect(await createQuickPlan({ template: 'cloth', tier: 7 })).toEqual({
      error: 'Nenhum item desse plano rápido no T7.',
    })
    expect(await createQuickPlan({ template: 'jewelry', tier: 2 })).toEqual({
      error: 'Esse plano rápido não existe.',
    })
    expect(await db.plan.count()).toBe(0)
  })
})
