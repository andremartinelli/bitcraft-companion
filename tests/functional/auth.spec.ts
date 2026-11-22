import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Item from '#models/item'
import Plan from '#models/plan'
import User from '#models/user'
import env from '#start/env'
import { importTables } from '#tests/helpers/game_data'

/** .env.test turns the login on; the app's default is off */
test.group('Without login (LOGIN_REQUIRED off)', (group) => {
  group.each.setup(async () => {
    const rollback = await testUtils.db().withGlobalTransaction()
    env.set('LOGIN_REQUIRED', false)
    return rollback
  })
  group.each.teardown(() => env.set('LOGIN_REQUIRED', true))

  test('the pages open without signing in, with no "Sair"', async ({ client, assert }) => {
    await importTables()

    for (const path of ['/recipes', '/calculator', '/plans', '/inventory', '/game_players']) {
      const response = await client.get(path).redirects(0)
      response.assertStatus(200)
      assert.notInclude(response.text(), 'Sair', path)
    }
  })

  test('the login page sends to the home page', async ({ client }) => {
    const response = await client.get('/login').redirects(0)

    response.assertStatus(302)
    response.assertHeader('location', '/')
  })

  test('a plan can be saved without an author', async ({ client, assert }) => {
    await importTables()
    const plank = await Item.findByOrFail({ kind: 'item', gameId: 1030 })

    const response = await client
      .post('/plans')
      .form({ 'name': 'Sem login', 'targets[0][item_id]': plank.id, 'targets[0][quantity]': 2 })
      .withCsrfToken()
      .redirects(0)

    response.assertStatus(302)
    const plan = await Plan.findByOrFail('name', 'Sem login')
    assert.isNull(plan.createdById)
    assert.isNull(plan.updatedById)
  })
})

test.group('Auth', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('redirects guests from /recipes to /login', async ({ client }) => {
    const response = await client.get('/recipes').redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/login')
  })

  test('has no self-signup', async ({ client }) => {
    const response = await client.get('/signup').redirects(0)
    response.assertStatus(404)
  })

  test('logs in and lands on /recipes', async ({ client }) => {
    await User.create({ email: 'vitor@example.com', fullName: 'Vitor', password: 'secret-123' })

    const response = await client
      .post('/login')
      .form({ email: 'vitor@example.com', password: 'secret-123' })
      .withCsrfToken()
      .redirects(0)

    response.assertStatus(302)
    response.assertHeader('location', '/recipes')
  })

  test('rejects a wrong password', async ({ client }) => {
    await User.create({ email: 'vitor@example.com', fullName: 'Vitor', password: 'secret-123' })

    const response = await client
      .post('/login')
      .header('referer', '/login')
      .form({ email: 'vitor@example.com', password: 'wrong-pass' })
      .withCsrfToken()
      .redirects(0)

    response.assertStatus(302)
    response.assertHeader('location', '/login')
  })
})
