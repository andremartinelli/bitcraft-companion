import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Item from '#models/item'
import User from '#models/user'
import { importTables } from '#tests/helpers/game_data'

const idOf = async (kind: 'item' | 'cargo', gameId: number) => {
  const item = await Item.findByOrFail({ kind, gameId })
  return item.id
}

test.group('Quick calculator', (group) => {
  let user: User

  group.each.setup(async () => {
    const rollback = await testUtils.db().withGlobalTransaction()
    await importTables()
    user = await User.create({ email: 'vitor@example.com', password: 'secret-123' })
    return rollback
  })

  test('starts empty and explains what to do', async ({ client }) => {
    const response = await client.get('/calculator').loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('Adicione um ou mais itens')
  })

  test('shows raw materials and effort for the targets in the URL', async ({ client, assert }) => {
    const plank = await idOf('item', 1030)
    const response = await client
      .get(`/calculator?targets[0][item_id]=${plank}&targets[0][quantity]=10`)
      .loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('Matéria-prima que falta')
    response.assertTextIncludes('Rough Wood Trunk')
    response.assertTextIncludes('Carpentry')
    response.assertTextIncludes('Salvar como plano')
    assert.notInclude(response.text(), '@!', 'an Edge tag leaked into the HTML')
  })

  test('raw choices and owned quantities change the result', async ({ client, assert }) => {
    const plank = await idOf('item', 1030)
    const stripped = await idOf('item', 1020)
    const response = await client
      .get(
        `/calculator?targets[0][item_id]=${plank}&targets[0][quantity]=10&choices[i${stripped}]=raw&owned[i${stripped}]=5`
      )
      .loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('usando 5 que vocês informaram')
    assert.notInclude(response.text(), 'Rough Wood Trunk')
  })

  test('adding an item redirects to the canonical URL', async ({ client }) => {
    const plank = await idOf('item', 1030)
    const response = await client.get(`/calculator?add=${plank}`).redirects(0).loginAs(user)

    response.assertStatus(302)
    response.assertHeader(
      'location',
      `/calculator?${encodeURIComponent('targets[0][item_id]')}=${plank}&${encodeURIComponent('targets[0][quantity]')}=1`
    )
  })

  test('htmx requests get the panel and the URL to push', async ({ client, assert }) => {
    const plank = await idOf('item', 1030)
    const response = await client
      .get(`/calculator?targets[0][item_id]=${plank}&targets[0][quantity]=2&remove=0`)
      .header('HX-Request', 'true')
      .loginAs(user)

    response.assertStatus(200)
    assert.include(response.text(), 'id="calculator"')
    assert.notInclude(response.text(), '<html')
    response.assertHeader('hx-push-url', '/calculator')
  })

  test('an invalid quantity shows an error instead of failing', async ({ client }) => {
    const plank = await idOf('item', 1030)
    const response = await client
      .get(`/calculator?targets[0][item_id]=${plank}&targets[0][quantity]=0`)
      .loginAs(user)

    response.assertStatus(422)
    response.assertTextIncludes('A quantidade precisa ser um número inteiro')
  })

  test('item search returns suggestions for the picker', async ({ client }) => {
    const response = await client.get('/items?q=plank').header('HX-Request', 'true').loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('name="add"')
    response.assertTextIncludes('Rough Plank')
  })
})
