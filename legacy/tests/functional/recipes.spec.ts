import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import { importTables } from '#tests/helpers/game_data'

test.group('Recipes index', (group) => {
  let user: User

  group.each.setup(async () => {
    const rollback = await testUtils.db().withGlobalTransaction()
    await importTables()
    user = await User.create({ email: 'vitor@example.com', password: 'secret-123' })
    return rollback
  })

  test('lists crafting recipes and hides scrap recipes by default', async ({ client, assert }) => {
    const response = await client.get('/recipes').loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('Saw Rough Stripped Wood')
    response.assertTextIncludes('Dados do jogo de')
    assert.notInclude(response.text(), '@!', 'an Edge tag leaked into the HTML')
    assert.notInclude(response.text(), 'Scrap Rough Plank')
    assert.notInclude(response.text(), 'Starter House')
  })

  test('shows scrap recipes with all=true', async ({ client }) => {
    const response = await client.get('/recipes').qs({ all: 'true' }).loginAs(user)

    response.assertTextIncludes('Scrap Rough Plank')
  })

  test('finds recipes by ingredient, product or random output content', async ({
    client,
    assert,
  }) => {
    const byIngredient = await client.get('/recipes').qs({ q: 'stripped' }).loginAs(user)
    byIngredient.assertTextIncludes('Treat Rough Stripped Wood Into Rough Plank')
    byIngredient.assertTextIncludes('Saw Rough Stripped Wood')
    assert.notInclude(byIngredient.text(), 'Craft Simple Plank')

    const byListContent = await client.get('/recipes').qs({ q: 'bark' }).loginAs(user)
    byListContent.assertTextIncludes('Split Rough Wood Trunk into Rough Wood Log Output')
    byListContent.assertTextIncludes('75%')
  })

  test('filters by skill and ignores empty form fields', async ({ client, assert }) => {
    const response = await client
      .get('/recipes')
      .qs({ q: '', skill: '2', station: '', verb: '' })
      .loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('Split Rough Wood Trunk')
    assert.notInclude(response.text(), 'Saw Rough Stripped Wood')
  })

  test('answers htmx requests with the list only', async ({ client, assert }) => {
    const response = await client.get('/recipes').header('HX-Request', 'true').loginAs(user)

    response.assertStatus(200)
    assert.include(response.text(), 'id="recipe-list"')
    assert.notInclude(response.text(), '<html')
  })

  test('lists construction recipes on their own tab', async ({ client, assert }) => {
    const response = await client.get('/recipes').qs({ kind: 'construction' }).loginAs(user)

    response.assertTextIncludes('Starter House')
    assert.notInclude(response.text(), 'Saw Rough Stripped Wood')
  })
})
