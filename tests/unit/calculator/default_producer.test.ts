import { describe, expect, test } from 'vitest'
import { defaultProducer } from '@/services/calculator/production_planner'
import { RecipeGraph, type GraphRecipe } from '@/services/calculator/recipe_graph'

const recipe = (id: number, name: string, stationName: string): GraphRecipe => ({
  id,
  name,
  verb: name.split(' ')[0],
  skillName: 'Cooking',
  skillLevel: 1,
  stationName,
  stationTier: 1,
  toolName: null,
  toolTier: null,
  actionsRequired: 1,
  hidden: false,
  inputs: [],
})

const WATER_BUCKET = 1

describe('the default recipe of an item', () => {
  test('on a tie, the Well wins over a lower recipe id', () => {
    const graph = new RecipeGraph(
      new Map(),
      new Map([
        [1562, recipe(1562, 'Boil Water Bucket', 'Cooking Station')],
        [4746, recipe(4746, 'Fill Water Bucket', 'Well')],
      ]),
      new Map([
        [
          WATER_BUCKET,
          [
            { recipeId: 1562, yield: 1, deterministic: true },
            { recipeId: 4746, yield: 1, deterministic: true },
          ],
        ],
      ])
    )
    expect(defaultProducer(graph, WATER_BUCKET)?.recipeId).toBe(4746)
  })
})
