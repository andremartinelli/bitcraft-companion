import { test } from '@japa/runner'
import ace from '@adonisjs/core/services/ace'
import app from '@adonisjs/core/services/app'
import testUtils from '@adonisjs/core/services/test_utils'
import InventorySyncCommand from '#commands/inventory_sync'
import GamePlayer from '#models/game_player'
import InventoryContainer from '#models/inventory_container'
import SyncRun from '#models/sync_run'
import { BitJitaInventorySource } from '#services/game_sync/inventory_source'
import { importTables } from '#tests/helpers/game_data'
import {
  bitjitaSource,
  everyPathAnswers,
  fakeBitJita,
  PLAYER_ONE,
  PLAYER_TWO,
} from '#tests/helpers/bitjita'

test.group('inventory:sync', (group) => {
  group.each.setup(async () => {
    const rollback = await testUtils.db().withGlobalTransaction()
    await importTables()
    await GamePlayer.createMany([PLAYER_ONE, PLAYER_TWO])
    // Keeps the command's logs in memory, for the assertions
    ace.ui.switchMode('raw')
    return rollback
  })
  group.each.teardown(() => {
    ace.ui.switchMode('normal')
    app.container.restore(BitJitaInventorySource)
  })

  test('syncs the inventories from the source in the container', async ({ assert }) => {
    app.container.swap(BitJitaInventorySource, () => bitjitaSource())

    const command = await ace.create(InventorySyncCommand, [])
    await command.exec()

    command.assertSucceeded()
    command.assertLogMatches(/Sincronização concluída/)
    const run = await SyncRun.latest()
    assert.equal(run!.status, 'ok')
    const containers = await InventoryContainer.all()
    assert.isAbove(containers.length, 0)
  })

  test('fails when BitJita cannot be read', async () => {
    app.container.swap(BitJitaInventorySource, () =>
      bitjitaSource(fakeBitJita(everyPathAnswers({ status: 503, body: {} })))
    )

    const command = await ace.create(InventorySyncCommand, [])
    await command.exec()

    command.assertFailed()
    command.assertLogMatches(/Sincronização falhou/)
  })
})
