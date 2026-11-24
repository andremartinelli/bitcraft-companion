import { beforeEach, describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import { calculate } from '@/services/calculator/calculate'
import { emptyState } from '@/services/calculator/state_params'
import { importTables } from '../../helpers/game_data'

const itemId = async (kind: 'item' | 'cargo', gameId: number) =>
  (await db.item.findUniqueOrThrow({ where: { kind_gameId: { kind, gameId } } })).id

describe('calculation as the page shows it', () => {
  beforeEach(() => importTables())

  test('starts empty', async () => {
    const panel = await calculate(emptyState())
    expect(panel.empty).toBe(true)
    expect(panel.inventory).toEqual({ available: false, enabled: false, syncedAt: null })
  })

  test('what to gather, then the steps in rounds, by profession', async () => {
    const plank = await itemId('item', 1030)
    const panel = await calculate({ ...emptyState(), targets: [{ itemId: plank, quantity: 10 }] })

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
    const panel = await calculate({
      ...emptyState(),
      targets: [{ itemId: plank, quantity: 10 }],
      choices: { [stripped]: 'raw' },
      owned: { [stripped]: 5 },
    })

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

  test('a building: what it takes, then building it as the last round', async () => {
    const house = await db.recipe.findUniqueOrThrow({
      where: { kind_gameId: { kind: 'construction', gameId: 50 } },
    })
    const panel = await calculate({
      ...emptyState(),
      buildings: [{ recipeId: house.id, quantity: 1 }],
    })

    expect(panel.buildings.map((b) => [b.recipe.name, b.quantity, b.removed])).toEqual([
      ['Starter House', 1, false],
    ])
    expect(panel.buildRound?.round).toBe(panel.rounds.at(-1)!.round + 1)
    expect(panel.buildRound?.entries[0].waitingLabel).toContain('Rough Plank')
  })
})
