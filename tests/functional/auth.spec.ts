import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'

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
