import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import GamePlayer from '#models/game_player'
import SyncRun from '#models/sync_run'
import { scheduledSync } from '#services/game_sync/scheduled_sync'
import { importTables } from '#tests/helpers/game_data'
import { bitjitaSource, fakeBitJita, PLAYER_ONE, PLAYER_TWO } from '#tests/helpers/bitjita'

test.group('Scheduled sync', (group) => {
  group.each.setup(async () => {
    const rollback = await testUtils.db().withGlobalTransaction()
    await importTables()
    return rollback
  })

  const pastRun = (minutesAgo: number) =>
    SyncRun.create({
      trigger: 'manual',
      source: 'bitjita',
      status: 'ok',
      startedAt: DateTime.now().minus({ minutes: minutesAgo }),
      finishedAt: DateTime.now().minus({ minutes: minutesAgo }),
    })

  test('does nothing without characters', async ({ assert }) => {
    const fake = fakeBitJita()

    assert.isNull(await scheduledSync(bitjitaSource(fake), 15))
    assert.lengthOf(fake.calls, 0)
    assert.lengthOf(await SyncRun.all(), 0)
  })

  test('skips when a sync started a moment ago (the button)', async ({ assert }) => {
    await GamePlayer.createMany([PLAYER_ONE, PLAYER_TWO])
    await pastRun(3)
    const fake = fakeBitJita()

    assert.isNull(await scheduledSync(bitjitaSource(fake), 15))
    assert.lengthOf(fake.calls, 0)
  })

  test('syncs when the last sync is old enough', async ({ assert }) => {
    await GamePlayer.createMany([PLAYER_ONE, PLAYER_TWO])
    await pastRun(20)

    const run = await scheduledSync(bitjitaSource(), 15)

    assert.equal(run?.trigger, 'schedule')
    assert.equal(run?.status, 'ok')
  })
})
