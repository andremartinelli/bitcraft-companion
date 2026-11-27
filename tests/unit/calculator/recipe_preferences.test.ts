import { describe, expect, test } from 'vitest'
import { defaultProducer } from '@/services/calculator/production_planner'
import { RecipeGraph, type GraphItem, type GraphRecipe } from '@/services/calculator/recipe_graph'

const item = (id: number, name: string, tag: string, rarity = 'Common'): GraphItem => ({
  id,
  name,
  tier: 1,
  rarity,
  iconAssetName: null,
  kind: 'item',
  tag,
  removed: false,
})

const recipe = (id: number, name: string, inputs: number[]): GraphRecipe => ({
  id,
  name,
  verb: name.split(' ')[0],
  skillName: 'Carpentry',
  skillLevel: 1,
  stationName: 'Station',
  stationTier: 1,
  toolName: null,
  toolTier: null,
  actionsRequired: 1,
  hidden: false,
  inputs: inputs.map((itemId) => ({ itemId, quantity: 1 })),
})

/**
 * The default recipe of `target` among `recipes`, listed with the lowest id
 * first so that, without the rules, the first one would win
 */
function pick(
  items: GraphItem[],
  target: number,
  recipes: GraphRecipe[],
  options: { gatherers?: [number, string][]; random?: number[] } = {}
) {
  const graph = new RecipeGraph(
    new Map(items.map((i) => [i.id, i])),
    new Map(recipes.map((r) => [r.id, r])),
    new Map([
      [
        target,
        recipes.map((r) => ({
          recipeId: r.id,
          yield: 1,
          deterministic: !options.random?.includes(r.id),
        })),
      ],
    ]),
    new Map(options.gatherers ?? [])
  )
  return graph.recipes.get(defaultProducer(graph, target)!.recipeId)!.name
}

describe('how players normally make an item', () => {
  test('never with a special input (Hexite, ruins) when something else makes it', () => {
    const items = [
      item(1, 'Rough Plank', 'Plank'),
      item(2, 'Stripped Wood', 'Wood'),
      item(3, 'Hexite Wood Fragment', 'Fragment'),
    ]
    const name = pick(items, 1, [recipe(10, 'With Hexite', [2, 3]), recipe(11, 'Plain', [2])], {
      gatherers: [[3, 'Carpentry']],
    })
    expect(name).toBe('Plain')
  })

  test('a random byproduct beats a recipe with a special input', () => {
    const items = [
      item(1, 'Basic Amber Resin', 'Resin'),
      item(2, 'Trunk', 'Trunk'),
      item(3, 'Hexite Wood Fragment', 'Fragment'),
    ]
    const name = pick(
      items,
      1,
      [
        recipe(10, 'Craft Basic Amber Resin', [3]),
        recipe(11, 'Split into Rough Wood Log Output', [2]),
      ],
      {
        gatherers: [[3, 'Carpentry']],
        random: [11],
      }
    )
    expect(name).toBe('Split into Rough Wood Log Output')
  })

  test('cooking experiments and trophy fish only when nothing else makes it', () => {
    const items = [item(1, 'Plain Mashed Bulbs', 'Food'), item(2, 'Basic Starbulb', 'Vegetable')]
    expect(
      pick(items, 1, [
        recipe(10, 'Cook Basic Starbulb Experiment', [2]),
        recipe(11, 'Cook Plain Mashed Bulbs', [2]),
      ])
    ).toBe('Cook Plain Mashed Bulbs')
    expect(
      pick(items, 1, [
        recipe(10, 'Craft T1 Large Trophy Fish Outputs', [2]),
        recipe(11, 'Craft Briny Argus Products', [2]),
      ])
    ).toBe('Craft Briny Argus Products')
  })

  test('equipment from the previous tier at the lowest rarity', () => {
    const items = [
      item(1, 'Emarium Hoe', 'Farmer Tool', 'Uncommon'),
      item(2, 'Pyrelite Hoe', 'Farmer Tool', 'Uncommon'),
      item(3, 'Pyrelite Hoe', 'Farmer Tool', 'Common'),
    ]
    expect(
      pick(
        items,
        1,
        [recipe(10, 'Craft Emarium Hoe', [2]), recipe(11, 'Craft Emarium Hoe (common)', [3])],
        { random: [10, 11] }
      )
    ).toBe('Craft Emarium Hoe (common)')
  })

  test('fish oil from the lake fish, amber resin from the trunk, sturdy leather from the tanned pelt', () => {
    const oil = [
      item(1, 'Infused Fish Oil', 'Fish Oil'),
      item(2, 'Greenhorn Gorbu', 'Ocean Fish'),
      item(3, 'Greenhorn Dolo', 'Lake Fish'),
    ]
    expect(
      pick(oil, 1, [
        recipe(10, 'Craft Greenhorn Gorbu Products', [2]),
        recipe(11, 'Craft Greenhorn Dolo Products', [3]),
      ])
    ).toBe('Craft Greenhorn Dolo Products')
    const resin = [
      item(1, 'Fine Amber Resin', 'Resin'),
      item(2, 'Bark', 'Bark'),
      item(3, 'Log', 'Log'),
    ]
    expect(
      pick(resin, 1, [
        recipe(10, 'Split into Fine Tree Bark Output', [2]),
        recipe(11, 'Split into Fine Wood Log Output', [3]),
      ])
    ).toBe('Split into Fine Wood Log Output')
    const leather = [
      item(1, 'Sturdy Leather', 'Leather'),
      item(2, 'Dried Boot', 'Junk'),
      item(3, 'Sturdy Tanned Pelt', 'Pelt'),
    ]
    expect(
      pick(leather, 1, [
        recipe(10, 'Stitch Dried Boot', [2]),
        recipe(11, 'Stitch Sturdy Tanned Pelt', [3]),
      ])
    ).toBe('Stitch Sturdy Tanned Pelt')
  })
})
