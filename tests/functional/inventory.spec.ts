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

  test('opens on the first tab: items by the profession that makes them', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/inventory').loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('Última sincronização')
    response.assertTextIncludes('concluída')
    response.assertTextIncludes('BitJita')
    response.assertTextIncludes('Sincronizar agora')
    assert.match(response.text(), /aria-current="page"\s*>Por profissão/)
    response.assertTextIncludes('Carpentry')
    response.assertTextIncludes('Forestry')
    response.assertTextIncludes('Sem receita (coleta, drop ou loja)')
    // Each line says where the item is and whose it is
    response.assertTextIncludes('Settlement Stash')
    response.assertTextIncludes('Depósito A')
    response.assertTextIncludes('Quartz')
    // The settlement's chests are not theirs to use: not shown
    assert.notInclude(response.text(), 'Baú de madeira')
    assert.notInclude(response.text(), 'Claim Vila Teste')
    assert.notInclude(response.text(), '@!', 'an Edge tag leaked into the HTML')
  })

  test('the categories collapse, with "expand all" and "collapse all"', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/inventory?tab=places').loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('Expandir tudo')
    response.assertTextIncludes('Recolher tudo')
    const sections = response
      .text()
      .match(/<details class="inventory__section inventory__fold" open data-key="places:\d+"/g)
    // Every place is its own section, with a key that does not repeat
    assert.isAbove(sections?.length ?? 0, 1)
    assert.equal(new Set(sections).size, sections?.length)
    assert.include(response.text(), 'x-data="inventorySections(false)"')
  })

  test('a search opens every section', async ({ client }) => {
    const response = await client
      .get('/inventory?q=plank')
      .header('HX-Request', 'true')
      .loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('x-data="inventorySections(true)"')
  })

  test('the group tab sums both players, in one table', async ({ client, assert }) => {
    const response = await client.get('/inventory?tab=group').loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('Rough Plank')
    // Stash 40 + bank 10 (Nimbus), stash 6 + house 12 (Quartz)
    response.assertTextIncludes('68')
    response.assertTextIncludes('4 locais')
    assert.notInclude(response.text(), '<details')
  })

  test('per player shows only what is theirs, not the claim chests', async ({ client, assert }) => {
    const response = await client.get('/inventory?tab=players').loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('Nimbus')
    response.assertTextIncludes('Quartz')
    assert.notInclude(response.text(), 'Claim Vila Teste')
  })

  test('per place: stash, cart, house, bank, without the claim chests', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/inventory?tab=places').loginAs(user)

    response.assertStatus(200)
    assert.notInclude(response.text(), 'Baú de madeira')
    response.assertTextIncludes('Settlement Stash')
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

  test('an unknown tab falls back to the first one', async ({ client }) => {
    const response = await client.get('/inventory?tab=nope').loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('Sem receita (coleta, drop ou loja)')
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
    response.assertTextIncludes('Depósito A')
    assert.isAbove(fake.calls.length, 0)
    assert.isFalse(fake.calls.some((call) => call.path.startsWith('/api/claims/')))
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

  test('from a plan, the sync comes back to the plan; never to another site', async ({
    client,
  }) => {
    app.container.swap(BitJitaInventorySource, () => bitjitaSource())

    const back = await client
      .post('/inventory/sync')
      .form({ return_to: '/calculator?targets[0][item_id]=1' })
      .withCsrfToken()
      .redirects(0)
      .loginAs(user)
    back.assertStatus(302)
    back.assertHeader('location', '/calculator?targets[0][item_id]=1')
    back.assertFlashMessage('success', 'Sincronização concluída.')

    const away = await client
      .post('/inventory/sync')
      .form({ return_to: '//evil.example/plans' })
      .withCsrfToken()
      .redirects(0)
      .loginAs(user)
    away.assertHeader('location', '/inventory')
  })

  test('the plan page has the sync button once there is a sync', async ({ client }) => {
    const response = await client.get('/calculator?targets[0][item_id]=1').loginAs(user)

    response.assertTextIncludes('form="calc-sync"')
    response.assertTextIncludes('Sincronizar agora')
  })

  test('without characters the page says how to start', async ({ client, assert }) => {
    await GamePlayer.query().delete()

    const response = await client.get('/inventory').loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('Nenhum personagem cadastrado')
    assert.notInclude(response.text(), 'Sincronizar agora')
  })

  test('the item page says how many the group has and where', async ({ client, assert }) => {
    const plank = await Item.findByOrFail({ kind: 'item', gameId: 1030 })
    const response = await client.get(`/items/${plank.id}`).loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('Vocês têm:')
    response.assertTextIncludes('68')
    response.assertTextIncludes('Depósito A')
    assert.notInclude(response.text(), 'Baú de madeira')
  })
})
