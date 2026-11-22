import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Plan from '#models/plan'
import QuickPlans from '#services/plans/quick_plans'
import { importTables, withSetsAndTools } from '#tests/helpers/game_data'

const names = (items: { name: string; rarity: string | null }[]) =>
  items.map((item) => `${item.name} (${item.rarity})`)

test.group('Quick plans', (group) => {
  group.each.setup(async () => {
    const rollback = await testUtils.db().withGlobalTransaction()
    await importTables(withSetsAndTools())
    return rollback
  })

  test('an armor set: one craft result per piece, never a drop variant', async ({ assert }) => {
    const items = await new QuickPlans().items('leather', 2)

    assert.deepEqual(names(items), ['Simple Leather Belt (Common)', 'Simple Leather Cap (Common)'])
  })

  test('from T3 on, the common craft; recraft-only items stay out', async ({ assert }) => {
    const items = await new QuickPlans().items('leather', 3)

    assert.deepEqual(names(items), ['Sturdy Leather Cap (Common)'])
  })

  test('the metal set takes the chosen style', async ({ assert }) => {
    const quick = new QuickPlans()

    assert.deepEqual(names(await quick.items('metal', 2, 'Plated')), [
      'Pyrelite Plated Boots (Common)',
      'Pyrelite Plated Helm (Common)',
    ])
    assert.deepEqual(names(await quick.items('metal', 2, 'Duelist')), [
      'Pyrelite Duelist Helm (Common)',
    ])
  })

  test('tools: one per profession, the station-made one over the hand-made Flint', async ({
    assert,
  }) => {
    const items = await new QuickPlans().items('tools', 1)

    assert.deepEqual(names(items), [
      'Cooking Pot (Common)',
      'Ferralith Axe (Common)',
      'Ferralith Pickaxe (Common)',
    ])
  })

  test('the catalog lists the tiers that have items, with the material', async ({ assert }) => {
    const catalog = await new QuickPlans().catalog()
    const tiers = Object.fromEntries(
      catalog.map((entry) => [entry.key, entry.tiers.map((tier) => tier.label)])
    )

    assert.deepEqual(tiers, {
      leather: ['T2 · Simple (2 itens)', 'T3 · Sturdy (1 item)'],
      cloth: ['T2 · Simple (1 item)'],
      metal: ['T2 · Pyrelite (2 itens)'],
      tools: ['T1 · Ferralith (3 itens)', 'T2 · Pyrelite (1 item)'],
      homestead: ['T3 · Homestead (3 itens)', 'T4 · Homestead (2 itens)'],
    })
    assert.deepEqual(catalog.find((entry) => entry.key === 'metal')!.styles, ['Plated', 'Duelist'])
  })

  test('creates a plan with one of each, using the inventory', async ({ assert }) => {
    const plan = await new QuickPlans().create('metal', 2, 'Duelist', null)

    assert.equal(plan!.name, 'Set de minério Duelist T2')
    const saved = await Plan.query().where('id', plan!.id).preload('items').firstOrFail()
    assert.lengthOf(saved.items, 1)
    assert.equal(saved.items[0].quantity, 1)
    assert.isTrue(saved.useInventory)
  })

  test('a tier with none of the items creates nothing', async ({ assert }) => {
    assert.isNull(await new QuickPlans().create('cloth', 5, 'Plated', null))
    assert.isNull(await new QuickPlans().create('homestead', 9, 'Plated', null))
    assert.lengthOf(await Plan.all(), 0)
  })

  test('settlement upgrade: what the Homestead research of the tier takes', async ({ assert }) => {
    const items = await new QuickPlans().items('homestead', 3)

    assert.deepEqual(
      items.map((item) => `${item.quantity}× ${item.name}`),
      ['575× Rough Wood Scraps', '2× Simple Plank', '2× Rough Wood Trunk']
    )
  })

  test('the Homestead plan has the quantities and the supplies as a note', async ({ assert }) => {
    const plan = await new QuickPlans().create('homestead', 4, 'Plated', null)

    assert.equal(plan!.name, 'Homestead T4')
    assert.equal(
      plan!.notes,
      'Pesquisa "Tier 4 Homestead" do assentamento. Além dos itens, ela custa 1.690 de suprimentos do assentamento.'
    )
    const saved = await Plan.query().where('id', plan!.id).preload('items').firstOrFail()
    assert.deepEqual(
      saved.items.map((item) => item.quantity),
      [850, 5]
    )
  })
})
