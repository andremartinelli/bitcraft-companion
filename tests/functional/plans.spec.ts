import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import Item from '#models/item'
import Plan from '#models/plan'
import Recipe from '#models/recipe'
import User from '#models/user'
import { importTables } from '#tests/helpers/game_data'

const idOf = async (kind: 'item' | 'cargo', gameId: number) => {
  const item = await Item.findByOrFail({ kind, gameId })
  return item.id
}

const loadPlan = (id: number) =>
  Plan.query()
    .where('id', id)
    .preload('items')
    .preload('buildings')
    .preload('choices')
    .preload('ownedItems')
    .firstOrFail()

test.group('Plans', (group) => {
  let user: User

  group.each.setup(async () => {
    const rollback = await testUtils.db().withGlobalTransaction()
    await importTables()
    user = await User.create({
      email: 'vitor@example.com',
      fullName: 'Vitor',
      password: 'secret-123',
    })
    return rollback
  })

  const createPlan = async (state: Record<string, string>) => {
    const plan = await Plan.create({
      name: 'Ferramentas T2',
      createdById: user.id,
      updatedById: user.id,
    })
    const plank = await idOf('item', 1030)
    await plan.saveState(
      {
        targets: [{ itemId: plank, quantity: Number(state.quantity ?? 10) }],
        choices: {},
        owned: {},
      },
      user
    )
    return plan
  }

  test('saving from the calculator creates a plan and opens it', async ({ client, assert }) => {
    const plank = await idOf('item', 1030)
    const response = await client
      .post('/plans')
      .form({ 'name': 'Pranchas', 'targets[0][item_id]': plank, 'targets[0][quantity]': 10 })
      .withCsrfToken()
      .redirects(0)
      .loginAs(user)

    response.assertStatus(302)
    const plan = await Plan.findByOrFail('name', 'Pranchas')
    response.assertHeader('location', `/plans/${plan.id}`)
    const loaded = await loadPlan(plan.id)
    assert.deepEqual(loaded.toCalculatorState().targets, [{ itemId: plank, quantity: 10 }])
  })

  test('lists plans with who changed them last', async ({ client, assert }) => {
    await createPlan({})
    const response = await client.get('/plans').loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('Ferramentas T2')
    response.assertTextIncludes('por Vitor')
    // The button makes a new plan; it no longer opens the calculator
    response.assertTextIncludes('Novo plano')
    assert.notInclude(response.text(), 'Nova calculadora')
  })

  test('"Novo plano" creates an empty plan, saved, and opens it', async ({ client, assert }) => {
    const response = await client
      .post('/plans')
      .form({ name: 'Novo plano' })
      .withCsrfToken()
      .redirects(0)
      .loginAs(user)

    response.assertStatus(302)
    const plan = await Plan.findByOrFail('name', 'Novo plano')
    response.assertHeader('location', `/plans/${plan.id}`)
    const loaded = await loadPlan(plan.id)
    assert.lengthOf(loaded.items, 0)
    assert.lengthOf(loaded.buildings, 0)

    const page = await client.get(`/plans/${plan.id}`).loginAs(user)
    page.assertStatus(200)
    page.assertTextIncludes('Adicione itens ou construções')
  })

  test('a building goes into the plan, saved, with what it takes', async ({ client, assert }) => {
    const plan = await createPlan({})
    const house = await Recipe.findByOrFail({ kind: 'construction', gameId: 50 })
    const plank = await idOf('item', 1030)

    const response = await client
      .patch(`/plans/${plan.id}`)
      .form({
        'targets[0][item_id]': plank,
        'targets[0][quantity]': 10,
        'add_building': house.id,
      })
      .header('HX-Request', 'true')
      .withCsrfToken()
      .loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('name="buildings[0][recipe_id]"')
    response.assertTextIncludes('Starter House')
    response.assertTextIncludes('· Construir')
    // 10 planks and 2 trunks per house
    response.assertTextIncludes('10 Rough Plank + 2 Rough Wood Trunk → 1 Starter House')
    const saved = await loadPlan(plan.id)
    assert.deepEqual(saved.toCalculatorState().buildings, [{ recipeId: house.id, quantity: 1 }])

    const removed = await client
      .patch(`/plans/${plan.id}`)
      .form({
        'targets[0][item_id]': plank,
        'buildings[0][recipe_id]': house.id,
        'remove_building': 0,
      })
      .header('HX-Request', 'true')
      .withCsrfToken()
      .loginAs(user)
    removed.assertStatus(200)
    const after = await loadPlan(plan.id)
    assert.lengthOf(after.buildings, 0)
  })

  test('the picker finds buildings too', async ({ client }) => {
    const response = await client.get('/items?q=house').header('HX-Request', 'true').loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('name="add_building"')
    response.assertTextIncludes('Starter House')
  })

  test('the plan page shows the calculator with the saved state', async ({ client }) => {
    const plan = await createPlan({})
    const response = await client.get(`/plans/${plan.id}`).loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('Ferramentas T2')
    response.assertTextIncludes('Rough Wood Trunk')
  })

  test('changes are saved: quantity, choices and owned', async ({ client, assert }) => {
    const plan = await createPlan({})
    const plank = await idOf('item', 1030)
    const stripped = await idOf('item', 1020)

    const response = await client
      .patch(`/plans/${plan.id}`)
      .form({
        'targets[0][item_id]': plank,
        'targets[0][quantity]': 4,
        [`choices[i${stripped}]`]: 'raw',
        [`owned[i${stripped}]`]: 3,
      })
      .header('HX-Request', 'true')
      .withCsrfToken()
      .loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('id="calculator"')
    const saved = await loadPlan(plan.id)
    const state = saved.toCalculatorState()
    assert.deepEqual(state, {
      targets: [{ itemId: plank, quantity: 4 }],
      buildings: [],
      choices: { [stripped]: 'raw' },
      owned: { [stripped]: 3 },
      useInventory: true,
    })
  })

  test('renaming keeps the calculation', async ({ client, assert }) => {
    const plan = await createPlan({})
    const response = await client
      .patch(`/plans/${plan.id}`)
      .form({ name: 'Ferramentas T3' })
      .header('HX-Request', 'true')
      .withCsrfToken()
      .loginAs(user)

    response.assertStatus(204)
    const loaded = await loadPlan(plan.id)
    assert.equal(loaded.name, 'Ferramentas T3')
    assert.lengthOf(loaded.items, 1)
  })

  test('a saved choice for a recipe that left the game falls back with a warning', async ({
    client,
  }) => {
    const plan = await createPlan({})
    const stripped = await idOf('item', 1020)
    const saw = await Recipe.findByOrFail({ kind: 'crafting', gameId: 101 })
    await plan.related('choices').create({ itemId: stripped, recipeId: saw.id })
    saw.removedAt = DateTime.now()
    await saw.save()

    const response = await client.get(`/plans/${plan.id}`).loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('não existe mais ou não produz esse item')
  })

  test('a target that left the game is marked, not an error', async ({ client }) => {
    const plan = await createPlan({})
    const plank = await Item.findByOrFail({ kind: 'item', gameId: 1030 })
    plank.removedAt = DateTime.now()
    await plank.save()

    const response = await client.get(`/plans/${plan.id}`).loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('saiu do jogo')
  })

  test('deleting a plan sends htmx back to the list', async ({ client, assert }) => {
    const plan = await createPlan({})
    const response = await client
      .delete(`/plans/${plan.id}`)
      .header('HX-Request', 'true')
      .withCsrfToken()
      .loginAs(user)

    response.assertStatus(204)
    response.assertHeader('hx-redirect', '/plans')
    assert.isNull(await Plan.find(plan.id))
  })
})
