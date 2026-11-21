import { test } from '@japa/runner'
import ace from '@adonisjs/core/services/ace'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import UsersCreate from '#commands/users_create'

test.group('users:create', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('creates a user from flags', async ({ assert }) => {
    const command = await ace.create(UsersCreate, [
      '--email=friend@example.com',
      '--name=Amigo',
      '--password=secret-123',
    ])
    await command.exec()

    command.assertSucceeded()
    const user = await User.findByOrFail('email', 'friend@example.com')
    assert.equal(user.fullName, 'Amigo')
    assert.notEqual(user.password, 'secret-123')
  })

  test('refuses a duplicate e-mail', async ({ assert }) => {
    await User.create({ email: 'friend@example.com', password: 'secret-123' })

    const command = await ace.create(UsersCreate, [
      '--email=friend@example.com',
      '--password=secret-456',
    ])
    await command.exec()

    command.assertFailed()
    assert.lengthOf(await User.query().where('email', 'friend@example.com'), 1)
  })
})
