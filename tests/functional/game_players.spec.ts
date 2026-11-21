import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import testUtils from '@adonisjs/core/services/test_utils'
import GamePlayer from '#models/game_player'
import InventoryContainer from '#models/inventory_container'
import User from '#models/user'
import { BitJitaInventorySource } from '#services/game_sync/inventory_source'
import InventorySync from '#services/game_sync/inventory_sync'
import { importTables } from '#tests/helpers/game_data'
import {
  bitjitaFixture,
  bitjitaSource,
  CLAIM,
  fakeBitJita,
  PLAYER_ONE,
  PLAYER_TWO,
  recordedResponses,
} from '#tests/helpers/bitjita'

test.group('Game players', (group) => {
  let user: User

  group.each.setup(async () => {
    const rollback = await testUtils.db().withGlobalTransaction()
    await importTables()
    user = await User.create({ email: 'vitor@example.com', password: 'secret-123' })
    return rollback
  })
  group.each.teardown(() => app.container.restore(BitJitaInventorySource))

  test('lists the characters with region and claim', async ({ client }) => {
    await GamePlayer.create({
      ...PLAYER_ONE,
      regionId: 14,
      claims: [{ entityId: CLAIM.entityId, name: CLAIM.name }],
    })

    const response = await client.get('/game_players').loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('Nimbus')
    response.assertTextIncludes('Região 14')
    response.assertTextIncludes('Vila Teste')
    response.assertTextIncludes('ainda não')
  })

  test('adds a character after finding the exact nick on BitJita', async ({ client, assert }) => {
    const responses = recordedResponses()
    responses['/api/players?q=nimbus'] = { body: bitjitaFixture('players_search') }
    app.container.swap(BitJitaInventorySource, () => bitjitaSource(fakeBitJita(responses)))

    const response = await client
      .post('/game_players')
      .form({ username: 'nimbus' })
      .withCsrfToken()
      .redirects(0)
      .loginAs(user)

    response.assertStatus(302)
    response.assertHeader('location', '/game_players')
    const player = await GamePlayer.findByOrFail('entityId', PLAYER_ONE.entityId)
    assert.equal(player.username, 'Nimbus')
    assert.equal(player.regionId, 14)
    assert.deepEqual(player.claims, [{ entityId: CLAIM.entityId, name: CLAIM.name }])
  })

  test('refuses a nick BitJita does not know', async ({ client, assert }) => {
    const responses = recordedResponses()
    responses['/api/players?q=Ninguem'] = { body: { players: [], total: 0 } }
    app.container.swap(BitJitaInventorySource, () => bitjitaSource(fakeBitJita(responses)))

    const response = await client
      .post('/game_players')
      .form({ username: 'Ninguem' })
      .withCsrfToken()
      .redirects(0)
      .loginAs(user)

    response.assertStatus(302)
    response.assertFlashMessage('error', 'Nenhum personagem chamado "Ninguem" na BitJita.')
    assert.lengthOf(await GamePlayer.all(), 0)
  })

  test('BitJita down: nothing is saved and the page says so', async ({ client, assert }) => {
    app.container.swap(BitJitaInventorySource, () =>
      bitjitaSource(fakeBitJita({ '/api/players?q=Nimbus': { status: 503, body: {} } }))
    )

    const response = await client
      .post('/game_players')
      .form({ username: 'Nimbus' })
      .withCsrfToken()
      .redirects(0)
      .loginAs(user)

    response.assertStatus(302)
    assert.include(response.flashMessage('error'), 'Não foi possível consultar a BitJita agora')
    assert.lengthOf(await GamePlayer.all(), 0)
  })

  test('a character already on the list is not added twice', async ({ client, assert }) => {
    await GamePlayer.create(PLAYER_ONE)
    app.container.swap(BitJitaInventorySource, () => bitjitaSource())

    const response = await client
      .post('/game_players')
      .form({ username: 'Nimbus' })
      .withCsrfToken()
      .redirects(0)
      .loginAs(user)

    response.assertFlashMessage('error', 'Nimbus já está na lista.')
    assert.lengthOf(await GamePlayer.all(), 1)
  })

  test('the nick is required', async ({ client, assert }) => {
    const response = await client
      .post('/game_players')
      .form({ username: '' })
      .withCsrfToken()
      .redirects(0)
      .loginAs(user)

    response.assertStatus(302)
    assert.deepEqual(response.flashMessage('inputErrorsBag'), {
      username: ['Informe o nick do personagem.'],
    })
  })

  test('removing a character takes its inventory away, not the others', async ({
    client,
    assert,
  }) => {
    await GamePlayer.createMany([PLAYER_ONE, PLAYER_TWO])
    await new InventorySync(bitjitaSource()).run('manual')
    const one = await GamePlayer.findByOrFail('entityId', PLAYER_ONE.entityId)
    const two = await GamePlayer.findByOrFail('entityId', PLAYER_TWO.entityId)

    const response = await client
      .delete(`/game_players/${one.id}`)
      .header('HX-Request', 'true')
      .withCsrfToken()
      .loginAs(user)

    response.assertStatus(204)
    response.assertHeader('hx-redirect', '/game_players')
    assert.lengthOf(await InventoryContainer.query().where('game_player_id', one.id), 0)
    const others = await InventoryContainer.query().where('game_player_id', two.id)
    assert.isAbove(others.length, 0)
  })
})
