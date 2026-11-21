import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import GamePlayer from '#models/game_player'
import Item from '#models/item'
import SyncRun from '#models/sync_run'
import User from '#models/user'
import { BitJitaInventorySource } from '#services/game_sync/inventory_source'
import InventorySync from '#services/game_sync/inventory_sync'
import { importTables } from '#tests/helpers/game_data'
import {
  bitjitaSource,
  everyPathAnswers,
  fakeBitJita,
  PLAYER_ONE,
  PLAYER_TWO,
} from '#tests/helpers/bitjita'

test.group('Inventory page', (group) => {
  let user: User

  group.each.setup(async () => {
    const rollback = await testUtils.db().withGlobalTransaction()
    await importTables()
    user = await User.create({ email: 'vitor@example.com', password: 'secret-123' })
    await GamePlayer.createMany([PLAYER_ONE, PLAYER_TWO])
    await new InventorySync(bitjitaSource()).run('manual')
    return rollback
  })
  group.each.teardown(() => app.container.restore(BitJitaInventorySource))

  test('shows the group stock and the last sync', async ({ client, assert }) => {
    const response = await client.get('/inventory').loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('Última sincronização')
    response.assertTextIncludes('concluída')
    response.assertTextIncludes('BitJita')
    response.assertTextIncludes('Sincronizar agora')
    response.assertTextIncludes('Rough Plank')
    // 40 + 10 + 6 + 12 + 100: the shared claim counted once
    response.assertTextIncludes('168')
    response.assertTextIncludes('5 locais')
    assert.notInclude(response.text(), '@!', 'an Edge tag leaked into the HTML')
  })

  test('per player, with the claim chests apart', async ({ client }) => {
    const response = await client.get('/inventory?tab=players').loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('Nimbus')
    response.assertTextIncludes('Quartz')
    response.assertTextIncludes('Claim Vila Teste')
    response.assertTextIncludes('baús compartilhados pelo grupo')
  })

  test('per place: chests, cart, house, bank', async ({ client }) => {
    const response = await client.get('/inventory?tab=places').loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('Baú de madeira')
    response.assertTextIncludes('s Cart (II)')
    response.assertTextIncludes('Depósito A')
    response.assertTextIncludes('Banco')
  })

  test('the item search filters, and htmx gets only the list', async ({ client, assert }) => {
    const response = await client
      .get('/inventory?q=plank')
      .header('HX-Request', 'true')
      .loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('id="inventory-list"')
    response.assertTextIncludes('Rough Plank')
    response.assertTextIncludes('Simple Plank')
    assert.notInclude(response.text(), 'Rough Wood Log')
    assert.notInclude(response.text(), 'Sincronizar agora')
  })

  test('an unknown tab falls back to the group', async ({ client }) => {
    const response = await client.get('/inventory?tab=nope').loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('5 locais')
  })

  test('"Sincronizar agora" reads the source from the container and redraws the panel', async ({
    client,
    assert,
  }) => {
    const fake = fakeBitJita()
    app.container.swap(BitJitaInventorySource, () => bitjitaSource(fake))

    const response = await client
      .post('/inventory/sync')
      .form({ tab: 'places' })
      .header('HX-Request', 'true')
      .withCsrfToken()
      .loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('id="inventory"')
    response.assertTextIncludes('Sincronização concluída.')
    response.assertTextIncludes('Baú de madeira')
    assert.isAbove(fake.calls.length, 0)
    const runs = await SyncRun.query().orderBy('id')
    assert.lengthOf(runs, 2)
  })

  test('a failed sync keeps the data and points at the last one that worked', async ({
    client,
  }) => {
    app.container.swap(BitJitaInventorySource, () =>
      bitjitaSource(fakeBitJita(everyPathAnswers({ status: 503, body: {} })))
    )

    const response = await client
      .post('/inventory/sync')
      .header('HX-Request', 'true')
      .withCsrfToken()
      .loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('A sincronização falhou. Os dados anteriores foram mantidos.')
    response.assertTextIncludes('Nimbus: não foi possível ler')
    response.assertTextIncludes('Os dados abaixo são da última sincronização que funcionou')
    response.assertTextIncludes('Rough Plank')
  })

  test('a second sync while one is running does not run', async ({ client, assert }) => {
    await SyncRun.create({
      trigger: 'schedule',
      source: 'bitjita',
      status: 'running',
      startedAt: DateTime.now(),
    })
    const fake = fakeBitJita()
    app.container.swap(BitJitaInventorySource, () => bitjitaSource(fake))

    const response = await client
      .post('/inventory/sync')
      .header('HX-Request', 'true')
      .withCsrfToken()
      .loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('Já existe uma sincronização em andamento.')
    assert.lengthOf(fake.calls, 0)
  })

  test('without htmx the sync redirects back with a message', async ({ client }) => {
    app.container.swap(BitJitaInventorySource, () => bitjitaSource())

    const response = await client
      .post('/inventory/sync')
      .form({ tab: 'players', q: 'plank' })
      .withCsrfToken()
      .redirects(0)
      .loginAs(user)

    response.assertStatus(302)
    response.assertHeader('location', '/inventory?tab=players&q=plank')
    response.assertFlashMessage('success', 'Sincronização concluída.')
  })

  test('without characters the page says how to start', async ({ client, assert }) => {
    await GamePlayer.query().delete()

    const response = await client.get('/inventory').loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('Nenhum personagem cadastrado')
    assert.notInclude(response.text(), 'Sincronizar agora')
  })

  test('the item page says how many the group has and where', async ({ client }) => {
    const plank = await Item.findByOrFail({ kind: 'item', gameId: 1030 })
    const response = await client.get(`/items/${plank.id}`).loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('Vocês têm:')
    response.assertTextIncludes('168')
    response.assertTextIncludes('Baú de madeira')
    response.assertTextIncludes('Claim Vila Teste')
  })
})
