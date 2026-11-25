import { describe, expect, test } from 'vitest'
import { plan, previousTierInput } from '@/services/calculator/production_planner'
import { RecipeGraph, type GraphItem, type GraphRecipe } from '@/services/calculator/recipe_graph'
import { emptyState, setOwned } from '@/services/calculator/state_params'

const item = (id: number, name: string, tier: number, tag: string): GraphItem => ({
  id,
  name,
  tier,
  rarity: 'Common',
  kind: 'item',
  tag,
  removed: false,
})

const recipe = (id: number, verb: string, inputs: number[]): GraphRecipe => ({
  id,
  name: `${verb} ${id}`,
  verb,
  skillName: 'Smithing',
  skillLevel: 1,
  stationName: null,
  stationTier: null,
  toolName: null,
  toolTier: null,
  actionsRequired: 1,
  hidden: false,
  inputs: inputs.map((itemId) => ({ itemId, quantity: 1 })),
})

// Pyrelite Hammer (T2) = Ferralith Hammer (T1) + Pyrelite Ingot; also a recraft of itself
const FERRALITH = 1
const PYRELITE = 2
const INGOT = 3
const graph = new RecipeGraph(
  new Map([
    [FERRALITH, item(FERRALITH, 'Ferralith Hammer', 1, 'Blacksmith Tool')],
    [PYRELITE, item(PYRELITE, 'Pyrelite Hammer', 2, 'Blacksmith Tool')],
    [INGOT, item(INGOT, 'Pyrelite Ingot', 2, 'Metal')],
  ]),
  new Map([
    [10, recipe(10, 'Craft', [FERRALITH, INGOT])],
    [11, recipe(11, 'Recraft', [PYRELITE, INGOT])],
  ]),
  new Map([
    [
      PYRELITE,
      [
        { recipeId: 10, yield: 1, deterministic: true },
        { recipeId: 11, yield: 1, deterministic: true },
      ],
    ],
  ])
)

describe('previous tier of a tool', () => {
  test('the input of the same kind, one tier below', () => {
    expect(previousTierInput(graph, emptyState(), PYRELITE)).toBe(FERRALITH)
  })

  test('none when the item is not made here', () => {
    expect(previousTierInput(graph, emptyState(), FERRALITH)).toBeNull()
    expect(previousTierInput(graph, emptyState(), INGOT)).toBeNull()
    const raw = { ...emptyState(), choices: { [PYRELITE]: 'raw' as const } }
    expect(previousTierInput(graph, raw, PYRELITE)).toBeNull()
  })

  test('marked as theirs, it is not made again', () => {
    const state = { ...emptyState(), targets: [{ itemId: PYRELITE, quantity: 1 }] }
    const before = plan(graph, state).trees[0].children.find((c) => c.itemId === FERRALITH)!
    expect(before.missing).toBe(1)

    const after = plan(graph, setOwned(state, FERRALITH, '1')).trees[0].children.find(
      (c) => c.itemId === FERRALITH
    )!
    expect([after.fromOwned, after.missing, after.reason]).toEqual([1, 0, 'owned'])
  })
})
