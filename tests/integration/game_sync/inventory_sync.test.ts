import { beforeEach, describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import type { InventorySource, PlayerSnapshot } from '@/services/game_sync/inventory_source'
import InventorySync, {
  SyncAlreadyRunningError,
  syncSummary,
} from '@/services/game_sync/inventory_sync'
import {
  bitjitaFixture,
  bitjitaSource,
  CLAIM,
  everyPathAnswers,
  fakeBitJita,
  PLAYER_ONE,
  PLAYER_TWO,
  recordedResponses,
} from '../../helpers/bitjita'
import { importTables } from '../../helpers/game_data'
import { addBothPlayers, groupTotal, quantityIn } from '../../helpers/inventory'

/** The claim chests are off by default (no access); some tests turn them on */
const WITH_CLAIMS = { readClaims: true }

const claimChests = () => db.inventoryContainer.count({ where: { kind: 'claim' } })

describe('inventory sync', () => {
  beforeEach(async () => {
    await importTables()
    await addBothPlayers()
  })

  test('stores every inventory of the players, but not the claim chests', async () => {
    const fake = fakeBitJita()
    const run = await new InventorySync(bitjitaSource(fake)).run('manual')

    expect([run.status, run.message, run.source, run.trigger]).toEqual([
      'ok',
      null,
      'bitjita',
      'manual',
    ])
    expect(run.finishedAt).not.toBeNull()
    expect(run.counts).toMatchObject({
      players: 2,
      playersTotal: 2,
      claims: 0,
      claimsTotal: 0,
      containers: 14,
      unknownItems: 0,
    })

    // Stash 40 + bank 10 (one), stash 6 + house 12 (two); the claim chest is not read
    expect(await groupTotal('item', 1030)).toBe(68)
    expect(fake.calls.map((c) => c.path)).not.toContain(`/api/claims/${CLAIM.entityId}/inventories`)
    expect(await claimChests()).toBe(0)
    // The Settlement Stash is each player's own: it stays
    expect(await db.inventoryContainer.count({ where: { kind: 'stash' } })).toBe(2)
    // Two pockets of the backpack with the same item are summed
    expect(await quantityIn('Mochila', 'item', 1020, PLAYER_ONE.entityId)).toBe(9)

    const one = await db.gamePlayer.findUniqueOrThrow({ where: { entityId: PLAYER_ONE.entityId } })
    expect(one.lastSyncedAt).not.toBeNull()
    expect([one.lastError, one.regionId, one.claims]).toEqual([
      null,
      14,
      [{ entityId: CLAIM.entityId, name: CLAIM.name }],
    ])
    expect(syncSummary(run)).toBe(
      'Personagens: 2 de 2 · Locais: 14 · Itens diferentes por local: ' +
        (run.counts as { entries: number }).entries
    )
  })

  test('chests that were stored before are removed by the next sync', async () => {
    await new InventorySync(bitjitaSource(), WITH_CLAIMS).run('manual')
    expect(await claimChests()).toBe(3)

    await new InventorySync(bitjitaSource()).run('manual')

    expect(await claimChests()).toBe(0)
    expect(await groupTotal('item', 1030)).toBe(68)
  })

  test('with claim chests on, a claim shared by both players is read and counted once', async () => {
    const fake = fakeBitJita()
    await new InventorySync(bitjitaSource(fake), WITH_CLAIMS).run('manual')
    // 68 of the players plus the chest's 100: once, not twice
    expect(await groupTotal('item', 1030)).toBe(168)
    expect(fake.calls.filter((c) => c.path.startsWith('/api/claims/'))).toHaveLength(1)

    const chests = await db.inventoryContainer.findMany({ where: { kind: 'claim' } })
    expect(chests).toHaveLength(3)
    expect(chests.every((c) => c.gamePlayerId === null && c.claimName === CLAIM.name)).toBe(true)
    expect(await quantityIn('Baú de madeira', 'item', 1030)).toBe(100)
  })

  test('BitJita down: the run fails and the previous data stays', async () => {
    await new InventorySync(bitjitaSource()).run('manual')
    const before = await db.inventoryEntry.count()

    const down = fakeBitJita(everyPathAnswers(new TypeError('fetch failed')))
    const run = await new InventorySync(bitjitaSource(down)).run('auto')

    expect(run.status).toBe('failed')
    expect(run.message).toContain('Nimbus: não foi possível ler')
    expect((run.counts as { players: number }).players).toBe(0)
    expect(await db.inventoryEntry.count()).toBe(before)
    expect(await groupTotal('item', 1030)).toBe(68)

    const one = await db.gamePlayer.findUniqueOrThrow({ where: { entityId: PLAYER_ONE.entityId } })
    expect(one.lastError).toContain('BitJita')
    const lastGood = await db.syncRun.findFirstOrThrow({
      where: { status: { in: ['ok', 'partial'] } },
      orderBy: { id: 'desc' },
    })
    expect(lastGood.trigger).toBe('manual')
  })

  test('429: stops calling BitJita, keeps the data it could not read', async () => {
    await new InventorySync(bitjitaSource(), WITH_CLAIMS).run('manual')

    const responses = recordedResponses()
    responses[`/api/players/${PLAYER_TWO.entityId}`] = { status: 429, body: {} }
    const inventories = bitjitaFixture('player_one_inventories')
    inventories.inventories.find((i: { inventoryName?: string }) => i.inventoryName === 'Wallet')
      .pockets[0].contents.quantity++
    responses[`/api/players/${PLAYER_ONE.entityId}/inventories`] = { body: inventories }
    const fake = fakeBitJita(responses)

    const run = await new InventorySync(bitjitaSource(fake), WITH_CLAIMS).run('manual')

    expect(run.status).toBe('partial')
    expect(run.message).toContain('Quartz: não foi possível ler')
    expect(run.message).toContain(`Claim ${CLAIM.name}: não lida`)
    // Nothing after the 429
    expect(fake.calls.at(-1)!.path).toBe(`/api/players/${PLAYER_TWO.entityId}`)
    // Player one was updated; player two and the claim kept their data
    expect(await quantityIn('Carteira', 'item', 1060, PLAYER_ONE.entityId)).toBe(8)
    expect(await quantityIn('Carteira', 'item', 1060, PLAYER_TWO.entityId)).toBe(3)
    expect(await quantityIn('Depósito A', 'item', 1030)).toBe(12)
    expect(await quantityIn('Baú de madeira', 'item', 1030)).toBe(100)
  })

  test('unknown items are skipped and counted; the summary suggests the import', async () => {
    const responses = recordedResponses()
    const inventories = bitjitaFixture('player_one_inventories')
    inventories.inventories[0].pockets.push({
      locked: false,
      volume: 6000,
      contents: { itemId: 999999, itemType: 0, quantity: 5 },
    })
    responses[`/api/players/${PLAYER_ONE.entityId}/inventories`] = { body: inventories }

    const run = await new InventorySync(bitjitaSource(fakeBitJita(responses))).run('manual')

    expect(run.status).toBe('ok')
    expect((run.counts as { unknownItems: number }).unknownItems).toBe(1)
    expect(run.message).toContain('1 item desconhecido foi ignorado')
    expect(run.message).toContain('npm run game-data:import')
    expect(await quantityIn('Settlement Stash', 'item', 1030, PLAYER_ONE.entityId)).toBe(40)
  })

  test('a second sync while one is running does not run (the index is the lock)', async () => {
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
    // Wait for the first run to hold the lock
    while (!(await db.syncRun.count({ where: { status: 'running' } }))) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    const fake = fakeBitJita()
    await expect(new InventorySync(bitjitaSource(fake)).run('auto')).rejects.toBeInstanceOf(
      SyncAlreadyRunningError
    )
    expect(fake.calls).toHaveLength(0)
    release()

    expect((await first).status).toBe('ok')
    expect(await db.syncRun.count()).toBe(1)
  })

  test('a run left "running" by a dead function is closed and does not block', async () => {
    const stale = await db.syncRun.create({
      data: {
        trigger: 'cron',
        source: 'bitjita',
        status: 'running',
        startedAt: new Date(Date.now() - 6 * 60_000),
      },
    })

    const run = await new InventorySync(bitjitaSource()).run('manual')

    expect(run.status).toBe('ok')
    const closed = await db.syncRun.findUniqueOrThrow({ where: { id: stale.id } })
    expect([closed.status, closed.message]).toEqual(['failed', 'Interrompida antes de terminar.'])
  })

  test('a run started a moment ago still blocks', async () => {
    await db.syncRun.create({
      data: { trigger: 'auto', source: 'bitjita', status: 'running', startedAt: new Date() },
    })

    await expect(new InventorySync(bitjitaSource()).run('manual')).rejects.toBeInstanceOf(
      SyncAlreadyRunningError
    )
  })

  test('what left the game inventories leaves the app too', async () => {
    await new InventorySync(bitjitaSource()).run('manual')

    const responses = recordedResponses()
    const inventories = bitjitaFixture('player_one_inventories')
    inventories.inventories = inventories.inventories.filter(
      (i: { inventoryName?: string }) => !/Cart/.test(i.inventoryName ?? '')
    )
    inventories.inventories.find(
      (i: { inventoryName?: string }) => i.inventoryName === 'Inventory'
    ).pockets = []
    responses[`/api/players/${PLAYER_ONE.entityId}/inventories`] = { body: inventories }
    await new InventorySync(bitjitaSource(fakeBitJita(responses))).run('manual')

    expect(await db.inventoryContainer.findFirst({ where: { name: "Nimbus's Cart (II)" } })).toBe(
      null
    )
    expect(await quantityIn('Mochila', 'item', 1020, PLAYER_ONE.entityId)).toBeNull()
    // The empty backpack is still listed
    const backpack = await db.inventoryContainer.findFirst({
      where: { kind: 'personal', gamePlayer: { entityId: PLAYER_ONE.entityId } },
    })
    expect(backpack).not.toBeNull()
  })

  test('with claim chests on, those of a claim nobody belongs to are removed', async () => {
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

    expect(run.status).toBe('ok')
    expect(await claimChests()).toBe(0)
  })

  test('without players there is nothing to sync', async () => {
    await db.gamePlayer.deleteMany()

    const run = await new InventorySync(bitjitaSource()).run('manual')

    expect(run.status).toBe('failed')
    expect(run.message).toContain('Nenhum personagem: informe o seu em Meu personagem')
  })

  test("one account's characters: only them, the run is theirs, each one marked as tried", async () => {
    const one = await db.gamePlayer.findUniqueOrThrow({ where: { entityId: PLAYER_ONE.entityId } })
    const user = await db.user.findFirstOrThrow()
    const fake = fakeBitJita()

    const run = await new InventorySync(bitjitaSource(fake)).run('manual', {
      userId: user.id,
      playerIds: [one.id],
    })

    expect([run.status, run.userId]).toEqual(['ok', user.id])
    expect(fake.calls.some((call) => call.path.includes(PLAYER_TWO.entityId))).toBe(false)
    const players = await db.gamePlayer.findMany({ orderBy: { id: 'asc' } })
    expect(players.map((p) => p.lastAttemptAt !== null)).toEqual([true, false])
    expect(players.map((p) => p.lastSyncedAt !== null)).toEqual([true, false])
  })

  test("without a scope it reads the accounts' characters, not the others", async () => {
    await db.user.updateMany({
      where: { gamePlayer: { entityId: PLAYER_TWO.entityId } },
      data: { gamePlayerId: null },
    })
    const fake = fakeBitJita()

    const run = await new InventorySync(bitjitaSource(fake)).run('cron')

    expect((run.counts as { playersTotal: number }).playersTotal).toBe(1)
    expect(fake.calls.some((call) => call.path.includes(PLAYER_TWO.entityId))).toBe(false)
  })
})
