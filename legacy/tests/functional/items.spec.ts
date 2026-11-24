import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import Item from '#models/item'
import User from '#models/user'
import { importTables } from '#tests/helpers/game_data'

test.group('Item page', (group) => {
  let user: User

  group.each.setup(async () => {
    const rollback = await testUtils.db().withGlobalTransaction()
    await importTables()
    user = await User.create({ email: 'vitor@example.com', password: 'secret-123' })
    return rollback
  })

  test('shows a producer through a random output with its chance', async ({ client }) => {
    const bark = await Item.findByOrFail({ kind: 'item', gameId: 1050 })
    const response = await client.get(`/items/${bark.id}`).loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('Rough Tree Bark')
    response.assertTextIncludes('Split Rough Wood Trunk into Rough Wood Log Output')
    response.assertTextIncludes('25% de chance')
  })

  test('shows how to get an item and where it is used', async ({ client }) => {
    const plank = await Item.findByOrFail({ kind: 'item', gameId: 1030 })
    const response = await client.get(`/items/${plank.id}`).loginAs(user)

    response.assertTextIncludes('Como obter (1)')
    response.assertTextIncludes('Treat Rough Stripped Wood Into Rough Plank')
    response.assertTextIncludes('Usado em (3)')
    response.assertTextIncludes('Calcular custo')
    response.assertTextIncludes(`targets%5B0%5D%5Bitem_id%5D=${plank.id}`)
    response.assertTextIncludes('Craft Simple Plank')
    response.assertTextIncludes('Starter House')
  })

  test('answers 404 for a removed item', async ({ client }) => {
    const plank = await Item.findByOrFail({ kind: 'item', gameId: 1030 })
    plank.removedAt = DateTime.now()
    await plank.save()

    const response = await client.get(`/items/${plank.id}`).loginAs(user)
    response.assertStatus(404)
  })

  test('answers 404 for an id that is not a number', async ({ client }) => {
    const response = await client.get('/items/abc').loginAs(user)
    response.assertStatus(404)
  })
})
