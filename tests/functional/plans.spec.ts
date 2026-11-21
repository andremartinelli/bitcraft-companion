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

  test('lists plans with who changed them last', async ({ client }) => {
    await createPlan({})
    const response = await client.get('/plans').loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('Ferramentas T2')
    response.assertTextIncludes('por Vitor')
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
      choices: { [stripped]: 'raw' },
      owned: { [stripped]: 3 },
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
