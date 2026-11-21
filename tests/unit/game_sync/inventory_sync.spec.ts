import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import GamePlayer from '#models/game_player'
import InventoryContainer from '#models/inventory_container'
import Item from '#models/item'
import SyncRun from '#models/sync_run'
import type { InventorySource, PlayerSnapshot } from '#services/game_sync/inventory_source'
import InventorySync, { SyncAlreadyRunningError } from '#services/game_sync/inventory_sync'
import { importTables } from '#tests/helpers/game_data'
import {
  bitjitaFixture,
  bitjitaSource,
  CLAIM,
  everyPathAnswers,
  fakeBitJita,
  PLAYER_ONE,
  PLAYER_TWO,
  recordedResponses,
} from '#tests/helpers/bitjita'

/** The claim chests are off by default (no access); some tests turn them on */
const WITH_CLAIMS = { readClaims: true }

/** Total of an item across every container (the group's stock) */
async function groupTotal(kind: 'item' | 'cargo', gameId: number) {
  const item = await Item.findByOrFail({ kind, gameId })
  const row = await db
    .from('inventory_entries')
    .where('item_id', item.id)
    .sum('quantity as total')
    .first()
  return Number(row?.total ?? 0)
}

/** Quantity of an item in a container (of a player, when names repeat) */
async function quantityIn(
  containerName: string,
  kind: 'item' | 'cargo',
  gameId: number,
  playerEntityId?: string
) {
  const item = await Item.findByOrFail({ kind, gameId })
  const query = db
    .from('inventory_entries as e')
    .join('inventory_containers as c', 'c.id', 'e.container_id')
    .where('c.name', containerName)
    .where('e.item_id', item.id)
    .select('e.quantity')
  if (playerEntityId) {
    query.join('game_players as p', 'p.id', 'c.game_player_id').where('p.entity_id', playerEntityId)
  }
  const rows = await query
  if (rows.length > 1) throw new Error(`"${containerName}" is ambiguous: pass the player`)
  return rows.length ? Number(rows[0].quantity) : null
}

test.group('Inventory sync', (group) => {
  group.each.setup(async () => {
    const rollback = await testUtils.db().withGlobalTransaction()
    await importTables()
    await GamePlayer.createMany([PLAYER_ONE, PLAYER_TWO])
    return rollback
  })

  test('stores every inventory of the players, but not the claim chests', async ({ assert }) => {
    const fake = fakeBitJita()
    const run = await new InventorySync(bitjitaSource(fake)).run('manual')

    assert.equal(run.status, 'ok')
    assert.isNull(run.message)
    assert.equal(run.source, 'bitjita')
    assert.isNotNull(run.finishedAt)
    assert.deepInclude(run.counts!, {
      players: 2,
      playersTotal: 2,
      claims: 0,
      claimsTotal: 0,
      containers: 14,
      unknownItems: 0,
    })

    // Stash 40 + bank 10 (one), stash 6 + house 12 (two); the claim chest is not read
    assert.equal(await groupTotal('item', 1030), 68)
    assert.notInclude(
      fake.calls.map((c) => c.path),
      `/api/claims/${CLAIM.entityId}/inventories`
    )
    assert.lengthOf(await InventoryContainer.query().where('kind', 'claim'), 0)
    // The Settlement Stash is each player's own: it stays
    assert.lengthOf(await InventoryContainer.query().where('kind', 'stash'), 2)
    // Two pockets of the backpack with the same item are summed
    assert.equal(await quantityIn('Mochila', 'item', 1020, PLAYER_ONE.entityId), 9)

    const one = await GamePlayer.findByOrFail('entityId', PLAYER_ONE.entityId)
    assert.isNotNull(one.lastSyncedAt)
    assert.isNull(one.lastError)
    assert.equal(one.regionId, 14)
    assert.deepEqual(one.claims, [{ entityId: CLAIM.entityId, name: CLAIM.name }])
  })

  test('chests that were stored before are removed by the next sync', async ({ assert }) => {
    await new InventorySync(bitjitaSource(), WITH_CLAIMS).run('manual')
    assert.lengthOf(await InventoryContainer.query().where('kind', 'claim'), 3)

    await new InventorySync(bitjitaSource()).run('manual')

    assert.lengthOf(await InventoryContainer.query().where('kind', 'claim'), 0)
    assert.equal(await groupTotal('item', 1030), 68)
  })

  test('with claim chests on, a claim shared by both players is read and counted once', async ({
    assert,
  }) => {
    const fake = fakeBitJita()
    await new InventorySync(bitjitaSource(fake), WITH_CLAIMS).run('manual')
    // 68 of the players plus the chest's 100: once, not twice
    assert.equal(await groupTotal('item', 1030), 168)

    const claimCalls = fake.calls.filter((c) => c.path.startsWith('/api/claims/'))
    assert.lengthOf(claimCalls, 1)

    const chests = await InventoryContainer.query().where('kind', 'claim')
    assert.lengthOf(chests, 3)
    assert.isTrue(chests.every((c) => c.gamePlayerId === null && c.claimName === CLAIM.name))
    assert.equal(await quantityIn('Baú de madeira', 'item', 1030), 100)
  })

  test('BitJita down: the run fails and the previous data stays', async ({ assert }) => {
    await new InventorySync(bitjitaSource()).run('manual')
    const before = await db.from('inventory_entries').count('* as total').first()

    const down = fakeBitJita(everyPathAnswers(new TypeError('fetch failed')))
    const run = await new InventorySync(bitjitaSource(down)).run('schedule')

    assert.equal(run.status, 'failed')
    assert.include(run.message!, 'Nimbus: não foi possível ler')
    assert.equal(run.counts!.players, 0)
    const after = await db.from('inventory_entries').count('* as total').first()
    assert.equal(after.total, before.total)
    assert.equal(await groupTotal('item', 1030), 68)

    const one = await GamePlayer.findByOrFail('entityId', PLAYER_ONE.entityId)
    assert.include(one.lastError!, 'BitJita')
    const lastGood = await SyncRun.lastSuccessful()
    assert.equal(lastGood!.trigger, 'manual')
  })

  test('429: stops calling BitJita, keeps the data it could not read', async ({ assert }) => {
    await new InventorySync(bitjitaSource(), WITH_CLAIMS).run('manual')

    const responses = recordedResponses()
    responses[`/api/players/${PLAYER_TWO.entityId}`] = { status: 429, body: {} }
    const inventories = bitjitaFixture('player_one_inventories')
    inventories.inventories.find((i: any) => i.inventoryName === 'Wallet').pockets[0].contents
      .quantity++
    responses[`/api/players/${PLAYER_ONE.entityId}/inventories`] = { body: inventories }
    const fake = fakeBitJita(responses)

    const run = await new InventorySync(bitjitaSource(fake), WITH_CLAIMS).run('manual')

    assert.equal(run.status, 'partial')
    assert.include(run.message!, 'Quartz: não foi possível ler')
    assert.include(run.message!, `Claim ${CLAIM.name}: não lida`)
    // Nothing after the 429
    assert.equal(fake.calls.at(-1)!.path, `/api/players/${PLAYER_TWO.entityId}`)
    // Player one was updated; player two and the claim kept their data
    assert.equal(await quantityIn('Carteira', 'item', 1060, PLAYER_ONE.entityId), 8)
    assert.equal(await quantityIn('Carteira', 'item', 1060, PLAYER_TWO.entityId), 3)
    assert.equal(await quantityIn('Depósito A', 'item', 1030), 12)
    assert.equal(await quantityIn('Baú de madeira', 'item', 1030), 100)
  })

  test('unknown items are skipped and counted; the summary suggests bitcraft:import', async ({
    assert,
  }) => {
    const responses = recordedResponses()
    const inventories = bitjitaFixture('player_one_inventories')
    inventories.inventories[0].pockets.push({
      locked: false,
      volume: 6000,
      contents: { itemId: 999999, itemType: 0, quantity: 5 },
    })
    responses[`/api/players/${PLAYER_ONE.entityId}/inventories`] = { body: inventories }

    const run = await new InventorySync(bitjitaSource(fakeBitJita(responses))).run('manual')

    assert.equal(run.status, 'ok')
    assert.equal(run.counts!.unknownItems, 1)
    assert.include(run.message!, '1 item desconhecido foi ignorado')
    assert.include(run.message!, 'node ace bitcraft:import')
    assert.equal(await quantityIn('Settlement Stash', 'item', 1030, PLAYER_ONE.entityId), 40)
  })

  test('a second sync while one is running does not run', async ({ assert }) => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const real = bitjitaSource()
    const slow: InventorySource = {
      name: 'bitjita',
      findPlayer: (username) => real.findPlayer(username),
      fetchClaim: (claimId) => real.fetchClaim(claimId),
      fetchPlayer: async (entityId): Promise<PlayerSnapshot> => {
        await gate
        return real.fetchPlayer(entityId)
      },
    }

    const first = new InventorySync(slow).run('manual')
    await assert.rejects(
      () => new InventorySync(bitjitaSource()).run('schedule'),
      SyncAlreadyRunningError
    )
    release()
    const run = await first

    assert.equal(run.status, 'ok')
    assert.lengthOf(await SyncRun.all(), 1)
  })

  test('a sync running in another process (the ace command) blocks a new one', async ({
    assert,
  }) => {
    await SyncRun.create({
      trigger: 'manual',
      source: 'bitjita',
      status: 'running',
      startedAt: DateTime.now(),
    })

    await assert.rejects(
      () => new InventorySync(bitjitaSource()).run('schedule'),
      SyncAlreadyRunningError
    )
  })

  test('a run left "running" by a dead process is closed and does not block', async ({
    assert,
  }) => {
    const stale = await SyncRun.create({
      trigger: 'schedule',
      source: 'bitjita',
      status: 'running',
      startedAt: DateTime.now().minus({ hours: 1 }),
    })

    const run = await new InventorySync(bitjitaSource()).run('manual')

    assert.equal(run.status, 'ok')
    await stale.refresh()
    assert.equal(stale.status, 'failed')
  })

  test('what left the game inventories leaves the app too', async ({ assert }) => {
    await new InventorySync(bitjitaSource()).run('manual')

    const responses = recordedResponses()
    const inventories = bitjitaFixture('player_one_inventories')
    inventories.inventories = inventories.inventories.filter(
      (i: any) => !/Cart/.test(i.inventoryName ?? '')
    )
    inventories.inventories.find((i: any) => i.inventoryName === 'Inventory').pockets = []
    responses[`/api/players/${PLAYER_ONE.entityId}/inventories`] = { body: inventories }
    await new InventorySync(bitjitaSource(fakeBitJita(responses))).run('manual')

    assert.isNull(await InventoryContainer.findBy('name', "Nimbus's Cart (II)"))
    assert.isNull(await quantityIn('Mochila', 'item', 1020, PLAYER_ONE.entityId))
    const one = await GamePlayer.findByOrFail('entityId', PLAYER_ONE.entityId)
    const backpack = await InventoryContainer.query()
      .where({ kind: 'personal', gamePlayerId: one.id })
      .first()
    assert.isNotNull(backpack, 'the empty backpack is still listed')
  })

  test('with claim chests on, those of a claim nobody belongs to are removed', async ({
    assert,
  }) => {
    await new InventorySync(bitjitaSource(), WITH_CLAIMS).run('manual')

    const responses = recordedResponses()
    for (const [path, fixture] of [
      [`/api/players/${PLAYER_ONE.entityId}`, 'player_one'],
      [`/api/players/${PLAYER_TWO.entityId}`, 'player_two'],
    ]) {
      const player = bitjitaFixture(fixture)
      player.player.claims = []
      responses[path] = { body: player }
    }
    const run = await new InventorySync(bitjitaSource(fakeBitJita(responses)), WITH_CLAIMS).run(
      'manual'
    )

    assert.equal(run.status, 'ok')
    assert.lengthOf(await InventoryContainer.query().where('kind', 'claim'), 0)
  })

  test('without players there is nothing to sync', async ({ assert }) => {
    await GamePlayer.query().delete()

    const run = await new InventorySync(bitjitaSource()).run('manual')

    assert.equal(run.status, 'failed')
    assert.include(run.message!, 'Nenhum personagem cadastrado')
  })
})
