import { beforeEach, describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import { findPlan, insertPlan } from '@/models/plan'
import { emptyState } from '@/services/calculator/state_params'
import QuickPlans from '@/services/plans/quick_plans'
import { importTables, withSetsAndTools } from '../../helpers/game_data'

const names = (items: { name: string; rarity: string | null }[]) =>
  items.map((item) => `${item.name} (${item.rarity})`)

describe('quick plans', () => {
  beforeEach(() => importTables(withSetsAndTools()))

  test('an armor set: one craft result per piece, never a drop variant', async () => {
    const items = await new QuickPlans().items('leather', 2)

    expect(names(items)).toEqual(['Simple Leather Belt (Common)', 'Simple Leather Cap (Common)'])
  })

  test('from T3 on, the common craft; recraft-only items stay out', async () => {
    const items = await new QuickPlans().items('leather', 3)

    expect(names(items)).toEqual(['Sturdy Leather Cap (Common)'])
  })

  test('the metal set takes the chosen style', async () => {
    const quick = new QuickPlans()

    expect(names(await quick.items('metal', 2, 'Plated'))).toEqual([
      'Pyrelite Plated Boots (Common)',
      'Pyrelite Plated Helm (Common)',
    ])
    expect(names(await quick.items('metal', 2, 'Duelist'))).toEqual([
      'Pyrelite Duelist Helm (Common)',
    ])
  })

  test('tools: one per profession, the station-made one over the hand-made Flint', async () => {
    const items = await new QuickPlans().items('tools', 1)

    expect(names(items)).toEqual([
      'Cooking Pot (Common)',
      'Ferralith Axe (Common)',
      'Ferralith Pickaxe (Common)',
    ])
  })

  test('the catalog lists the tiers that have items, with the material', async () => {
    const catalog = await new QuickPlans().catalog()
    const tiers = Object.fromEntries(
      catalog.map((entry) => [entry.key, entry.tiers.map((tier) => tier.label)])
    )

    expect(tiers).toEqual({
      leather: ['T2 · Simple (2 itens)', 'T3 · Sturdy (1 item)'],
      cloth: ['T2 · Simple (1 item)'],
      metal: ['T2 · Pyrelite (2 itens)'],
      tools: ['T1 · Ferralith (3 itens)', 'T2 · Pyrelite (1 item)'],
      homestead: [
        'T1 · Fundação (2 itens)',
        'T3 · Homestead (3 itens)',
        'T4 · Homestead (2 itens)',
      ],
    })
    expect(catalog.map((entry) => entry.label)).toEqual([
      'Set de couro completo',
      'Set de cloth completo',
      'Set de minério completo',
      'Ferramentas',
      'Upgrades de assentamento',
    ])
    expect(catalog.find((entry) => entry.key === 'metal')!.styles).toEqual(['Plated', 'Duelist'])
  })

  test('creates a plan with one of each, using the inventory', async () => {
    const plan = await new QuickPlans().create('metal', 2, 'Duelist', null)

    expect(plan!.name).toBe('Set de minério Duelist T2')
    const saved = await findPlan(plan!.id)
    expect(saved!.items.map((item) => item.quantity)).toEqual([1])
  })

  test('the name has the tier', async () => {
    expect((await new QuickPlans().create('tools', 1, 'Plated', null))!.name).toBe('Ferramentas T1')
  })

  test('a tier with none of the items creates nothing', async () => {
    expect(await new QuickPlans().create('cloth', 5, 'Plated', null)).toBeNull()
    expect(await new QuickPlans().create('homestead', 9, 'Plated', null)).toBeNull()
    expect(await db.plan.count()).toBe(0)
  })

  test('settlement upgrade: what the Homestead research of the tier takes', async () => {
    const items = await new QuickPlans().items('homestead', 3)

    expect(items.map((item) => `${item.quantity}× ${item.name}`)).toEqual([
      '575× Rough Wood Scraps',
      '2× Simple Plank',
      '2× Rough Wood Trunk',
    ])
  })

  test('the Homestead plan has the quantities and the supplies as a note', async () => {
    const plan = await new QuickPlans().create('homestead', 4, 'Plated', null)

    expect(plan!.name).toBe('Homestead T4')
    expect(plan!.notes).toBe(
      'Pesquisa "Tier 4 Homestead" do assentamento. Além dos itens, ela custa 1.690 de suprimentos do assentamento.'
    )
    const saved = await findPlan(plan!.id)
    expect(saved!.items.map((item) => item.quantity)).toEqual([850, 5])
  })

  test('the foundation (T1): what the Rumbagh takes for the kit', async () => {
    const items = await new QuickPlans().items('homestead', 1)

    expect(items.map((item) => `${item.quantity}× ${item.name}`)).toEqual([
      "10× Beginner's Settlement Research",
      '5000× Hex Coin',
    ])
  })

  test('the foundation plan says how to found the settlement', async () => {
    const plan = await new QuickPlans().create('homestead', 1, 'Plated', null)

    expect(plan!.name).toBe('Fundação do Homestead')
    expect(plan!.notes).toContain('Rumbagh pelo Settlement Foundation Kit')
    const saved = await findPlan(plan!.id)
    expect(saved!.items.map((item) => item.quantity).sort((a, b) => a - b)).toEqual([10, 5000])
  })

  test('no foundation when one of its items left the game', async () => {
    await db.item.updateMany({ where: { gameId: 1 }, data: { removedAt: new Date() } })

    const catalog = await new QuickPlans().catalog()
    expect(
      catalog.find((entry) => entry.key === 'homestead')!.tiers.map((tier) => tier.tier)
    ).toEqual([3, 4])
    expect(await new QuickPlans().create('homestead', 1, 'Plated', null)).toBeNull()
  })

  describe('added to a plan', () => {
    const planWith = async (targets: { itemId: number; quantity: number }[], notes?: string) =>
      (await findPlan(
        (
          await insertPlan({
            name: 'Meu plano',
            notes,
            userId: null,
            state: { ...emptyState(), targets },
          })
        ).id
      ))!
    const lines = async (planId: number) =>
      (
        await db.planItem.findMany({
          where: { planId },
          orderBy: { position: 'asc' },
          select: { quantity: true, item: { select: { name: true } } },
        })
      ).map((line) => `${line.quantity}× ${line.item.name}`)

    test('sums what the plan has; the new items go at the end', async () => {
      const [axe] = await new QuickPlans().items('tools', 1)
      const plank = await db.item.findFirstOrThrow({ where: { name: 'Simple Plank' } })
      const plan = await planWith([
        { itemId: plank.id, quantity: 3 },
        { itemId: axe.id, quantity: 2 },
      ])

      expect(await new QuickPlans().add(plan, 'tools', 1, 'Plated', null)).toEqual([])
      expect(await lines(plan.id)).toEqual([
        '3× Simple Plank',
        '3× Cooking Pot',
        '1× Ferralith Axe',
        '1× Ferralith Pickaxe',
      ])
    })

    test("the settlement's note goes at the end of the notes, once", async () => {
      const plan = await planWith([], 'Para o clã')

      await new QuickPlans().add(plan, 'homestead', 4, 'Plated', null)
      const once = await findPlan(plan.id)
      await new QuickPlans().add(once!, 'homestead', 4, 'Plated', null)

      const saved = await findPlan(plan.id)
      expect(saved!.notes).toBe(
        'Para o clã\n\nPesquisa "Tier 4 Homestead" do assentamento. Além dos itens, ela custa 1.690 de suprimentos do assentamento.'
      )
      expect(await lines(plan.id)).toEqual(['1700× Rough Wood Scraps', '10× Simple Plank'])
    })

    test('over the limits or with no items, nothing changes', async () => {
      const coin = await db.item.findFirstOrThrow({ where: { gameId: 1, kind: 'item' } })
      const plan = await planWith([{ itemId: coin.id, quantity: 99_000 }])

      expect(await new QuickPlans().add(plan, 'homestead', 1, 'Plated', null)).toEqual([
        'A quantidade precisa ser um número inteiro entre 1 e 100.000.',
      ])
      expect(await new QuickPlans().add(plan, 'cloth', 5, 'Plated', null)).toBeNull()
      expect(await lines(plan.id)).toEqual(['99000× Hex Coin'])
      expect((await findPlan(plan.id))!.notes).toBeNull()
    })
  })
})
