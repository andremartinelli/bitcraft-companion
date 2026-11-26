import { describe, expect, test } from 'vitest'
import { UpstreamError } from '@/services/game_sync/bitjita_client'
import {
  classifyInventory,
  stacksFromPockets,
  stacksFromSlots,
} from '@/services/game_sync/inventory_source'
import {
  bitjitaFixture,
  bitjitaSource,
  CLAIM,
  fakeBitJita,
  PLAYER_ONE,
  PLAYER_TWO,
  recordedResponses,
} from '../../helpers/bitjita'

const summary = (containers: { kind: string; name: string }[]) =>
  containers.map((c) => `${c.kind}: ${c.name}`)

describe('BitJita inventory source', () => {
  test('classifies every inventory of a player', async () => {
    const snapshot = await bitjitaSource().fetchPlayer(PLAYER_ONE.entityId)

    expect(snapshot.player).toEqual({
      entityId: PLAYER_ONE.entityId,
      username: 'Nimbus',
      regionId: 14,
      claims: [{ entityId: CLAIM.entityId, name: CLAIM.name, inventory: true }],
    })
    expect(summary(snapshot.containers)).toEqual([
      'stash: Settlement Stash',
      'wallet: Carteira',
      'toolbelt: Cinto',
      'bank: Banco',
      'personal: Mochila',
      "deployable: Nimbus's Cart (II)",
    ])
    const stash = snapshot.containers.find((c) => c.kind === 'stash')!
    expect(stash.claim).toEqual({ entityId: CLAIM.entityId, name: CLAIM.name })
  })

  test('a player without a house (404) has no house storages', async () => {
    const fake = fakeBitJita()
    const snapshot = await bitjitaSource(fake).fetchPlayer(PLAYER_ONE.entityId)

    expect(snapshot.containers.map((c) => c.kind)).not.toContain('housing')
    expect(fake.calls.map((c) => c.path)).toContain(`/api/players/${PLAYER_ONE.entityId}/housing`)
  })

  test('reads personal caches, carts and the storages of the house', async () => {
    const snapshot = await bitjitaSource().fetchPlayer(PLAYER_TWO.entityId)

    expect(summary(snapshot.containers)).toEqual(
      expect.arrayContaining([
        "deployable: Quartz's Personal Cache (I)",
        "deployable: Quartz's Cart (II)",
        'housing: Depósito A',
        'housing: Depósito B',
      ])
    )
    const storage = snapshot.containers.find((c) => c.name === 'Depósito A')!
    expect(storage.items).toEqual([{ kind: 'item', gameId: 1030, quantity: 12 }])
    expect(storage.claim).toEqual({ entityId: CLAIM.entityId, name: CLAIM.name })
  })

  test('player inventories use itemId/itemType 0 and 1', async () => {
    const snapshot = await bitjitaSource().fetchPlayer(PLAYER_ONE.entityId)
    const stash = snapshot.containers.find((c) => c.kind === 'stash')!

    expect(stash.items).toEqual([
      { kind: 'item', gameId: 1030, quantity: 40 },
      { kind: 'cargo', gameId: 1010, quantity: 3 },
    ])
  })

  test('claim chests use item_id/item_type "item" and "cargo"', async () => {
    const snapshot = await bitjitaSource().fetchClaim(CLAIM.entityId)

    expect(
      snapshot.containers.map((c) => ({ kind: c.kind, name: c.name, items: c.items }))
    ).toEqual([
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
      { kind: 'claim', name: 'Banca', items: [{ kind: 'item', gameId: 1020, quantity: 5 }] },
    ])
    // The kind of building, to pick which kinds count (models/claim_building_choice)
    expect(snapshot.containers.map((c) => c.buildingId)).toEqual([3007, 3007, 90001, 3210])
  })

  test('both item formats are accepted in both places; empty slots are skipped', () => {
    expect(
      stacksFromPockets([
        { contents: { itemId: 1, itemType: 0, quantity: 2 } },
        { contents: { itemId: 2, itemType: 'cargo', quantity: 1 } },
        { contents: null },
        { contents: { itemId: 3, itemType: 7, quantity: 1 } },
      ])
    ).toEqual([
      { kind: 'item', gameId: 1, quantity: 2 },
      { kind: 'cargo', gameId: 2, quantity: 1 },
    ])
    expect(
      stacksFromSlots([
        { contents: { item_id: 4, item_type: 'item', quantity: 5 } },
        { contents: { item_id: 5, item_type: 1, quantity: 1 } },
        {},
      ])
    ).toEqual([
      { kind: 'item', gameId: 4, quantity: 5 },
      { kind: 'cargo', gameId: 5, quantity: 1 },
    ])
  })

  test('an inventory that matches no rule is "other", with the name it came with', () => {
    expect(
      classifyInventory(
        { entityId: '9', ownerEntityId: PLAYER_ONE.entityId, inventoryName: 'Quiver' },
        PLAYER_ONE.entityId
      )
    ).toEqual({ kind: 'other', name: 'Quiver' })
  })

  test('finds a player by the exact nick, ignoring case', async () => {
    const responses = recordedResponses()
    responses['/api/players?q=nimbus'] = { body: bitjitaFixture('players_search') }
    responses['/api/players?q=Nimb'] = { body: bitjitaFixture('players_search') }
    const source = bitjitaSource(fakeBitJita(responses))

    const found = await source.findPlayer('nimbus')
    expect([found?.entityId, found?.username]).toEqual([PLAYER_ONE.entityId, 'Nimbus'])
    expect(await source.findPlayer('Nimb')).toBeNull()
  })

  test('a failure other than 404 on the house fails the read', async () => {
    const responses = recordedResponses()
    responses[`/api/players/${PLAYER_ONE.entityId}/housing`] = { status: 500, body: {} }

    await expect(
      bitjitaSource(fakeBitJita(responses)).fetchPlayer(PLAYER_ONE.entityId)
    ).rejects.toBeInstanceOf(UpstreamError)
  })
})
