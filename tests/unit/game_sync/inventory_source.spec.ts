import { test } from '@japa/runner'
import { UpstreamError } from '#services/game_sync/bitjita_client'
import {
  classifyInventory,
  stacksFromPockets,
  stacksFromSlots,
} from '#services/game_sync/inventory_source'
import {
  bitjitaFixture,
  bitjitaSource,
  CLAIM,
  fakeBitJita,
  PLAYER_ONE,
  PLAYER_TWO,
  recordedResponses,
} from '#tests/helpers/bitjita'

const summary = (containers: { kind: string; name: string }[]) =>
  containers.map((c) => `${c.kind}: ${c.name}`)

test.group('BitJita inventory source', () => {
  test('classifies every inventory of a player', async ({ assert }) => {
    const snapshot = await bitjitaSource().fetchPlayer(PLAYER_ONE.entityId)

    assert.deepEqual(snapshot.player, {
      entityId: PLAYER_ONE.entityId,
      username: 'Nimbus',
      regionId: 14,
      claims: [{ entityId: CLAIM.entityId, name: CLAIM.name }],
    })
    assert.deepEqual(summary(snapshot.containers), [
      'stash: Settlement Stash',
      'wallet: Carteira',
      'toolbelt: Cinto',
      'bank: Banco',
      'personal: Mochila',
      "deployable: Nimbus's Cart (II)",
    ])
    const stash = snapshot.containers.find((c) => c.kind === 'stash')!
    assert.deepEqual(stash.claim, { entityId: CLAIM.entityId, name: CLAIM.name })
  })

  test('a player without a house (404) has no house storages', async ({ assert }) => {
    const fake = fakeBitJita()
    const snapshot = await bitjitaSource(fake).fetchPlayer(PLAYER_ONE.entityId)

    assert.notInclude(
      snapshot.containers.map((c) => c.kind),
      'housing'
    )
    assert.include(
      fake.calls.map((c) => c.path),
      `/api/players/${PLAYER_ONE.entityId}/housing`
    )
  })

  test('reads personal caches, carts and the storages of the house', async ({ assert }) => {
    const snapshot = await bitjitaSource().fetchPlayer(PLAYER_TWO.entityId)

    assert.includeMembers(summary(snapshot.containers), [
      "deployable: Quartz's Personal Cache (I)",
      "deployable: Quartz's Cart (II)",
      'housing: Depósito A',
      'housing: Depósito B',
    ])
    const storage = snapshot.containers.find((c) => c.name === 'Depósito A')!
    assert.deepEqual(storage.items, [{ kind: 'item', gameId: 1030, quantity: 12 }])
    assert.deepEqual(storage.claim, { entityId: CLAIM.entityId, name: CLAIM.name })
  })

  test('player inventories use itemId/itemType 0 and 1', async ({ assert }) => {
    const snapshot = await bitjitaSource().fetchPlayer(PLAYER_ONE.entityId)
    const stash = snapshot.containers.find((c) => c.kind === 'stash')!

    assert.deepEqual(stash.items, [
      { kind: 'item', gameId: 1030, quantity: 40 },
      { kind: 'cargo', gameId: 1010, quantity: 3 },
    ])
  })

  test('claim chests use item_id/item_type "item" and "cargo"', async ({ assert }) => {
    const snapshot = await bitjitaSource().fetchClaim(CLAIM.entityId)

    assert.deepEqual(
      snapshot.containers.map((c) => ({ kind: c.kind, name: c.name, items: c.items })),
      [
        {
          kind: 'claim',
          name: 'Baú de madeira',
          items: [
            { kind: 'item', gameId: 1030, quantity: 100 },
            { kind: 'item', gameId: 1020, quantity: 15 },
          ],
        },
        { kind: 'claim', name: 'Sturdy Large Chest', items: [] },
        { kind: 'claim', name: 'Reserva', items: [{ kind: 'cargo', gameId: 1010, quantity: 4 }] },
      ]
    )
  })

  test('both item formats are accepted in both places; empty slots are skipped', ({ assert }) => {
    assert.deepEqual(
      stacksFromPockets([
        { contents: { itemId: 1, itemType: 0, quantity: 2 } },
        { contents: { itemId: 2, itemType: 'cargo', quantity: 1 } },
        { contents: null },
        { contents: { itemId: 3, itemType: 7, quantity: 1 } },
      ]),
      [
        { kind: 'item', gameId: 1, quantity: 2 },
        { kind: 'cargo', gameId: 2, quantity: 1 },
      ]
    )
    assert.deepEqual(
      stacksFromSlots([
        { contents: { item_id: 4, item_type: 'item', quantity: 5 } },
        { contents: { item_id: 5, item_type: 1, quantity: 1 } },
        {},
      ]),
      [
        { kind: 'item', gameId: 4, quantity: 5 },
        { kind: 'cargo', gameId: 5, quantity: 1 },
      ]
    )
  })

  test('an inventory that matches no rule is "other", with the name it came with', ({ assert }) => {
    assert.deepEqual(
      classifyInventory(
        { entityId: '9', ownerEntityId: PLAYER_ONE.entityId, inventoryName: 'Quiver' },
        PLAYER_ONE.entityId
      ),
      { kind: 'other', name: 'Quiver' }
    )
  })

  test('finds a player by the exact nick, ignoring case', async ({ assert }) => {
    const responses = recordedResponses()
    responses['/api/players?q=nimbus'] = { body: bitjitaFixture('players_search') }
    responses['/api/players?q=Nimb'] = { body: bitjitaFixture('players_search') }
    const source = bitjitaSource(fakeBitJita(responses))

    const found = await source.findPlayer('nimbus')
    assert.equal(found?.entityId, PLAYER_ONE.entityId)
    assert.equal(found?.username, 'Nimbus')
    assert.isNull(await source.findPlayer('Nimb'))
  })

  test('a failure other than 404 on the house fails the read', async ({ assert }) => {
    const responses = recordedResponses()
    responses[`/api/players/${PLAYER_ONE.entityId}/housing`] = { status: 500, body: {} }

    await assert.rejects(
      () => bitjitaSource(fakeBitJita(responses)).fetchPlayer(PLAYER_ONE.entityId),
      UpstreamError
    )
  })
})
