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
import {
  addQuickPlan,
  createPlan,
  createPlanGroupShare,
  createPlanShare,
  createQuickPlan,
  destroyPlan,
  destroyPlanGroupShare,
  destroyPlanShare,
  updatePlan,
  updatePlanSetting,
} from '@/app/(app)/plans/actions'
import { db } from '@/lib/db'
import { insertGroup } from '@/models/group'
import { findPlan, insertPlan, toCalculatorState } from '@/models/plan'
import { planUserSetting } from '@/models/plan_user_setting'
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
    expect(await redirectedTo(addQuickPlan(plan.id, { template: 'tools', tier: 1 }))).toBe('/login')
    expect((await findPlan(plan.id))!.name).toBe('Ferramentas T2')
    expect(await db.plan.count()).toBe(1)
  })

  test('"Salvar como plano" creates the plan with the calculator state and opens it', async () => {
    const to = await redirectedTo(
      createPlan(NO_ERROR, form({ name: ' Pranchas ', state: `t=${plank}x10` }))
    )

    const plan = await db.plan.findFirstOrThrow({ where: { name: 'Pranchas' } })
    expect(to).toBe(`/plans/${plan.id}`)
    expect(plan.createdById).toBe(userId)
    expect(toCalculatorState((await findPlan(plan.id))!)).toEqual({
      ...emptyState(),
      targets: [{ itemId: plank, quantity: 10 }],
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

  test('"Planos rápidos" in a plan adds the items to it', async () => {
    const plan = await planWithPlanks()

    expect(await addQuickPlan(plan.id, { template: 'tools', tier: 1 })).toEqual(NO_ERROR)
    expect(refresh).toHaveBeenCalledOnce()
    const saved = await findPlan(plan.id)
    expect([saved!.items.length, saved!.items[0].quantity, saved!.updatedById]).toEqual([
      4,
      10,
      userId,
    ])
    expect(await addQuickPlan(plan.id, { template: 'cloth', tier: 7 })).toEqual({
      error: 'Nenhum item desse plano rápido no T7.',
    })
  })

  describe('with another account', () => {
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

    const as = async (id: number) => {
      request.token = await createSessionToken(id)
    }
    /** Vitor's group, with André in it */
    const clan = async () => {
      const group = (await insertGroup(userId, 'Clã')).group!
      await db.groupMember.create({ data: { groupId: group.id, userId: otherId } })
      return group
    }

    test("someone else's plan answers as deleted, and is not deleted", async () => {
      const plan = await planWithPlanks()
      await as(otherId)

      expect(await updatePlan(plan.id, { name: 'Meu agora' })).toEqual({
        errors: ['Este plano não existe mais. Ele pode ter sido apagado.'],
      })
      expect(await redirectedTo(destroyPlan(plan.id))).toBe('/plans')
      expect(await addQuickPlan(plan.id, { template: 'tools', tier: 1 })).toEqual({
        error: 'Este plano não existe mais. Ele pode ter sido apagado.',
      })
      const saved = await findPlan(plan.id)
      expect([saved!.name, saved!.items.length]).toEqual(['Ferramentas T2', 1])
    })

    test('the owner shares with someone of its group; that account edits it but cannot delete it', async () => {
      const plan = await planWithPlanks()
      await clan()

      await createPlanShare(plan.id, otherId)
      expect(refresh).toHaveBeenCalled()
      expect(await db.planShare.count()).toBe(1)

      await as(otherId)
      expect(await updatePlan(plan.id, { name: 'Ferramentas T3' })).toEqual({ errors: [] })
      const saved = await findPlan(plan.id)
      expect([saved!.name, saved!.updatedById]).toEqual(['Ferramentas T3', otherId])
      // The other account can't share it further, nor delete it
      await createPlanShare(plan.id, userId)
      expect(await db.planShare.count()).toBe(1)
      await redirectedTo(destroyPlan(plan.id))
      expect(await findPlan(plan.id)).not.toBeNull()
    })

    test('"Todos do grupo" on and off, only by the owner', async () => {
      const plan = await planWithPlanks()
      const group = await clan()

      await createPlanGroupShare(plan.id, group.id)
      expect(await db.planGroupShare.count()).toBe(1)
      await as(otherId)
      await destroyPlanGroupShare(plan.id, group.id)
      expect(await db.planGroupShare.count()).toBe(1)
      await as(userId)
      await destroyPlanGroupShare(plan.id, group.id)
      expect(await db.planGroupShare.count()).toBe(0)
    })

    test('leaving a shared plan goes back to the list; the owner can take an account out', async () => {
      const plan = await planWithPlanks()
      await clan()
      await createPlanShare(plan.id, otherId)

      await as(otherId)
      expect(await redirectedTo(destroyPlanShare(plan.id, otherId))).toBe('/plans')
      expect(await db.planShare.count()).toBe(0)

      await as(userId)
      await createPlanShare(plan.id, otherId)
      await destroyPlanShare(plan.id, otherId)
      expect(await db.planShare.count()).toBe(0)
    })
  })

  test('a character left out in "Inventários" is mine, only of its menu, in a plan I can open', async () => {
    const [mine, theirs] = await Promise.all(
      ['1', '2'].map((n) =>
        db.gamePlayer.create({ data: { username: `P${n}`, entityId: `10000000000000000${n}` } })
      )
    )
    const stranger = await db.gamePlayer.create({ data: { username: 'X', entityId: '3' } })
    await db.user.update({ where: { id: userId }, data: { gamePlayerId: mine.id } })
    const other = await db.user.create({
      data: { email: 'b@example.com', password: '-', gamePlayerId: theirs.id },
    })
    const plan = await insertPlan({ name: 'Meu', state: emptyState(), userId })
    await db.planShare.create({ data: { planId: plan.id, userId: other.id } })
    const notMine = await insertPlan({ name: 'Dele', state: emptyState(), userId: other.id })

    await updatePlanSetting(plan.id, { gamePlayerId: theirs.id, used: false })
    await updatePlanSetting(plan.id, { gamePlayerId: stranger.id, used: false })
    await updatePlanSetting(plan.id, { gamePlayerId: 'x', used: false })
    await updatePlanSetting(notMine.id, { gamePlayerId: theirs.id, used: false })

    expect((await planUserSetting(plan.id, userId)).excludedGamePlayerIds).toEqual([theirs.id])
    expect((await planUserSetting(plan.id, other.id)).excludedGamePlayerIds).toEqual([])
    expect(await db.planUserSetting.count({ where: { planId: notMine.id } })).toBe(0)
    expect(vi.mocked(refresh)).toHaveBeenCalled()
  })

  test("a claim left out of a plan: mine, only one of its menu, and back on it's used again", async () => {
    const claims = [
      { entityId: '200000000000000001', name: 'Vila' },
      { entityId: '200000000000000002', name: 'Porto' },
    ]
    const player = await db.gamePlayer.create({
      data: { username: 'Nimbus', entityId: '100000000000000001', claims },
    })
    await db.user.update({ where: { id: userId }, data: { gamePlayerId: player.id } })
    await db.countedClaim.createMany({
      data: claims.map((claim) => ({ userId, claimEntityId: claim.entityId })),
    })
    const plan = await insertPlan({ name: 'Meu', state: emptyState(), userId })

    await updatePlanSetting(plan.id, { claimEntityId: '200000000000000001', used: false })
    await updatePlanSetting(plan.id, { claimEntityId: '200000000000000002', used: false })
    // Not in the plan's menu, or not an id
    await updatePlanSetting(plan.id, { claimEntityId: '200000000000000003', used: false })
    await updatePlanSetting(plan.id, { claimEntityId: 'Vila', used: false })
    expect((await planUserSetting(plan.id, userId)).excludedClaimIds).toEqual([
      '200000000000000001',
      '200000000000000002',
    ])

    await updatePlanSetting(plan.id, { claimEntityId: '200000000000000001', used: true })
    const setting = await planUserSetting(plan.id, userId)
    expect([setting.excludedClaimIds, setting.excludedGamePlayerIds]).toEqual([
      ['200000000000000002'],
      [],
    ])
  })
})
