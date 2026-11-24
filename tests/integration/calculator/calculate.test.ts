import { beforeEach, describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import { calculate } from '@/services/calculator/calculate'
import { emptyState } from '@/services/calculator/state_params'
import { importTables } from '../../helpers/game_data'
import { syncBothPlayers } from '../../helpers/inventory'

const itemId = async (kind: 'item' | 'cargo', gameId: number) =>
  (await db.item.findUniqueOrThrow({ where: { kind_gameId: { kind, gameId } } })).id

describe('calculation as the page shows it', () => {
  beforeEach(() => importTables())

  test('starts empty', async () => {
    const panel = await calculate(emptyState(), 0)
    expect(panel.empty).toBe(true)
    expect(panel.inventory).toEqual({ available: false, enabled: false, syncedAt: null })
  })

  test('what to gather, then the steps in rounds, by profession', async () => {
    const plank = await itemId('item', 1030)
    const panel = await calculate(
      { ...emptyState(), targets: [{ itemId: plank, quantity: 10 }] },
      0
    )

    // Round 1 gathers; nothing in stock, so the crafts (log, stripped wood,
    // plank) take rounds 2 to 4, each waiting
    expect(panel.materials.map((m) => [m.item.name, m.qtyLabel, m.complete])).toEqual([
      ['Rough Wood Trunk', '0 / 10', false],
    ])
    expect(panel.materialsDone).toBe(0)
    expect(panel.rounds.map((r) => r.round)).toEqual([2, 3, 4])
    // Forestry gathers the trunk and splits it; Carpentry does the rest
    expect(panel.materialGroups.map((g) => g.name)).toEqual(['Forestry'])
    expect(panel.rounds.map((r) => r.professions.map((p) => p.name))).toEqual([
      ['Forestry'],
      ['Carpentry'],
      ['Carpentry'],
    ])
    expect(panel.rounds[0].steps[0].waitingLabel).toBe('10 Rough Wood Trunk')
    // Nothing done yet: nothing to fold
    expect(panel.completeCount).toBe(0)
  })

  test('raw choices and owned quantities change the result', async () => {
    const plank = await itemId('item', 1030)
    const stripped = await itemId('item', 1020)
    const panel = await calculate(
      {
        ...emptyState(),
        targets: [{ itemId: plank, quantity: 10 }],
        choices: { [stripped]: 'raw' },
        owned: { [stripped]: 5 },
      },
      0
    )

    const node = panel.trees[0].children[0]
    expect([node.fromOwned, node.ownedSource, node.reasonLabel]).toEqual([
      5,
      'manual',
      'tratado como matéria-prima',
    ])
    expect(panel.materials.map((m) => m.item.name)).toEqual(['Rough Stripped Wood'])
    // Stripped wood as raw material: no gathering gives it
    expect(panel.materialGroups.map((g) => g.name)).toEqual([
      'Outras fontes: loja, drop ou criatura',
    ])
  })

  /*
   * With the group's inventory (claim chests not read): 68 Rough Plank,
   * 10 Rough Stripped Wood, 27 Rough Wood Log. A plank takes 2 stripped
   * wood; stripped wood takes 1 log.
   */

  test('once synced, the inventory fills "já tenho" by default', async () => {
    const { userId } = await syncBothPlayers()
    const plank = await itemId('item', 1030)
    const panel = await calculate(
      { ...emptyState(), targets: [{ itemId: plank, quantity: 10 }] },
      userId
    )

    expect(panel.inventory).toMatchObject({ available: true, enabled: true })
    expect([panel.trees[0].fromOwned, panel.trees[0].ownedSource]).toEqual([10, 'inventory'])
    // The trunks that went into the planks they have show in "Coletar", covered
    expect(panel.materials.map((m) => m.coveredLabel)).toContain('vocês já têm em Rough Plank')
  })

  test('a value typed by hand wins, even 0; the rest comes from the inventory', async () => {
    const { userId } = await syncBothPlayers()
    const plank = await itemId('item', 1030)
    const stripped = await itemId('item', 1020)
    const panel = await calculate(
      {
        ...emptyState(),
        targets: [{ itemId: plank, quantity: 10 }],
        owned: { [plank]: 0, [stripped]: 3 },
      },
      userId
    )

    const node = panel.trees[0]
    expect([node.fromOwned, node.ownedSource]).toEqual([0, 'manual'])
    // 10 planks need 20 stripped wood: 3 typed by hand, 17 logs from the inventory
    const strippedNode = node.children[0]
    expect([strippedNode.fromOwned, strippedNode.ownedSource]).toEqual([3, 'manual'])
    expect([strippedNode.children[0].fromOwned, strippedNode.children[0].ownedSource]).toEqual([
      17,
      'inventory',
    ])
  })

  test('"Usar inventário do grupo" off: only what was typed', async () => {
    const { userId } = await syncBothPlayers()
    const plank = await itemId('item', 1030)
    const panel = await calculate(
      {
        ...emptyState(),
        targets: [{ itemId: plank, quantity: 10 }],
        useInventory: false,
      },
      userId
    )

    expect(panel.inventory).toMatchObject({ available: true, enabled: false })
    expect([panel.trees[0].fromOwned, panel.trees[0].ownedSource]).toEqual([0, null])
  })

  test('"Coletar" says who has each raw material', async () => {
    const { userId } = await syncBothPlayers()
    const plank = await itemId('item', 1030)
    const log = await itemId('item', 1010)
    // 30 planks, ignoring the ones in stock: 60 stripped wood, 10 in stock; logs as raw material
    const panel = await calculate(
      {
        ...emptyState(),
        targets: [{ itemId: plank, quantity: 30 }],
        owned: { [plank]: 0 },
        choices: { [log]: 'raw' },
      },
      userId
    )

    const logs = panel.materials.find((m) => m.item.id === log)!
    expect(logs.holdersLabel).toMatch(/^Nimbus \d+ · Quartz \d+$/)
  })

  test('a building: what it takes, then building it as the last round', async () => {
    const house = await db.recipe.findUniqueOrThrow({
      where: { kind_gameId: { kind: 'construction', gameId: 50 } },
    })
    const panel = await calculate(
      {
        ...emptyState(),
        buildings: [{ recipeId: house.id, quantity: 1 }],
      },
      0
    )

    expect(panel.buildings.map((b) => [b.recipe.name, b.quantity, b.removed])).toEqual([
      ['Starter House', 1, false],
    ])
    expect(panel.buildRound?.round).toBe(panel.rounds.at(-1)!.round + 1)
    expect(panel.buildRound?.entries[0].waitingLabel).toContain('Rough Plank')
  })
})
