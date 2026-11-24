import { beforeEach, describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import { plan, type CalculatorState } from '@/services/calculator/production_planner'
import { getRecipeGraph } from '@/services/calculator/recipe_graph'
import { fixtureTables, importTables, withHunting } from '../../helpers/game_data'

const findItem = (kind: 'item' | 'cargo', gameId: number) =>
  db.item.findUniqueOrThrow({ where: { kind_gameId: { kind, gameId } } })
const findRecipe = (kind: 'crafting' | 'construction', gameId: number) =>
  db.recipe.findUniqueOrThrow({ where: { kind_gameId: { kind, gameId } } })

const ids = async () => {
  const find = async (kind: 'item' | 'cargo', gameId: number) => {
    const found = await findItem(kind, gameId)
    return found.id
  }
  return {
    log: await find('item', 1010),
    stripped: await find('item', 1020),
    plank: await find('item', 1030),
    bark: await find('item', 1050),
    scraps: await find('item', 1060),
    trunk: await find('cargo', 1010),
  }
}

const state = (partial: Partial<CalculatorState>): CalculatorState => ({
  targets: [],
  choices: {},
  owned: {},
  ...partial,
})

describe('production planner', () => {
  beforeEach(() => importTables())

  test('expands 10 Rough Plank down to Rough Wood Trunk', async () => {
    const item = await ids()
    const result = plan(
      await getRecipeGraph(),
      state({ targets: [{ itemId: item.plank, quantity: 10 }] })
    )

    expect(result.rawMaterials).toEqual([{ itemId: item.trunk, quantity: 10, approximate: false }])
    expect(result.effortBySkill).toEqual([
      { skill: 'Carpentry', actions: 10 * 40 + 20 * 30 },
      { skill: 'Forestry', actions: 10 * 20 },
    ])
    const [tree] = result.trees
    expect(tree.crafts).toBe(10)
    expect(tree.children[0].itemId).toBe(item.stripped)
    expect(tree.children[0].needed).toBe(20)
  })

  test('a random output item can be a target itself', async () => {
    const output = await findItem('item', 1040)
    const item = await ids()
    const result = plan(
      await getRecipeGraph(),
      state({ targets: [{ itemId: output.id, quantity: 3 }] })
    )

    const [tree] = result.trees
    expect(tree.reason).toBe(null)
    expect(tree.crafts).toBe(3)
    expect(result.rawMaterials).toEqual([{ itemId: item.trunk, quantity: 3, approximate: false }])
  })

  test('uses expected values for random outputs', async () => {
    const item = await ids()
    const result = plan(
      await getRecipeGraph(),
      state({ targets: [{ itemId: item.bark, quantity: 1 }] })
    )

    const [tree] = result.trees
    expect(tree.approximate).toBe(true)
    expect(tree.crafts).toBe(4)
    expect(result.rawMaterials).toEqual([{ itemId: item.trunk, quantity: 4, approximate: true }])
  })

  test('stops at an item chosen as raw material', async () => {
    const item = await ids()
    const result = plan(
      await getRecipeGraph(),
      state({
        targets: [{ itemId: item.plank, quantity: 10 }],
        choices: { [item.stripped]: 'raw' },
      })
    )

    expect(result.rawMaterials).toEqual([
      { itemId: item.stripped, quantity: 20, approximate: false },
    ])
    expect(result.trees[0].children[0].reason).toBe('raw')
  })

  test('owning more than needed removes the step and never goes negative', async () => {
    const item = await ids()
    const result = plan(
      await getRecipeGraph(),
      state({ targets: [{ itemId: item.plank, quantity: 10 }], owned: { [item.stripped]: 25 } })
    )

    const stripped = result.trees[0].children[0]
    expect(stripped.fromOwned).toBe(20)
    expect(stripped.missing).toBe(0)
    expect(stripped.reason).toBe('owned')
    expect(stripped.children).toHaveLength(0)
    expect(result.rawMaterials).toEqual([])
  })

  test('sums repeated targets and uses what you own only once', async () => {
    const item = await ids()
    const result = plan(
      await getRecipeGraph(),
      state({
        targets: [
          { itemId: item.plank, quantity: 4 },
          { itemId: item.plank, quantity: 6 },
          { itemId: item.stripped, quantity: 5 },
        ],
        owned: { [item.stripped]: 22 },
      })
    )

    expect(result.trees).toHaveLength(2)
    expect(result.trees[0].needed).toBe(10)
    // planks take 20 of the 22 owned; the 5 stripped target gets the last 2 and makes 3
    expect(result.trees[1].fromOwned).toBe(2)
    expect(result.trees[1].missing).toBe(3)
    expect(result.rawMaterials).toEqual([{ itemId: item.trunk, quantity: 2, approximate: false }])
  })

  test('lists the steps in rounds, each waiting on what it needs', async () => {
    const item = await ids()
    const result = plan(
      await getRecipeGraph(),
      state({ targets: [{ itemId: item.plank, quantity: 10 }] })
    )

    expect(
      result.steps.map((s) => [s.itemId, s.round, s.quantity, s.crafts, s.readyCrafts])
    ).toEqual([
      [item.log, 1, 20, 10, 0],
      [item.stripped, 2, 20, 20, 0],
      [item.plank, 3, 10, 10, 0],
    ])
    expect(result.steps[0].waitingOn).toEqual([{ itemId: item.trunk, missing: 10, crafted: false }])
    expect(result.steps[2].waitingOn).toEqual([
      { itemId: item.stripped, missing: 20, crafted: true },
    ])
    expect(result.materials).toEqual([
      {
        itemId: item.trunk,
        needed: 10,
        owned: 0,
        missing: 10,
        approximate: false,
        covered: 0,
        coveredBy: [],
      },
    ])
  })

  test('the inputs they have make part of a step ready now', async () => {
    const item = await ids()
    const result = plan(
      await getRecipeGraph(),
      state({ targets: [{ itemId: item.plank, quantity: 10 }], owned: { [item.trunk]: 4 } })
    )

    const split = result.steps.find((s) => s.itemId === item.log)!
    expect(split.crafts).toBe(10)
    expect(split.readyCrafts).toBe(4)
    expect(result.materials).toEqual([
      {
        itemId: item.trunk,
        needed: 10,
        owned: 4,
        missing: 6,
        approximate: false,
        covered: 0,
        coveredBy: [],
      },
    ])
  })

  test('a raw material they have in full stays in the list, complete', async () => {
    const item = await ids()
    const result = plan(
      await getRecipeGraph(),
      state({ targets: [{ itemId: item.plank, quantity: 10 }], owned: { [item.trunk]: 15 } })
    )

    expect(result.rawMaterials).toEqual([])
    expect(result.materials).toEqual([
      {
        itemId: item.trunk,
        needed: 10,
        owned: 10,
        missing: 0,
        approximate: false,
        covered: 0,
        coveredBy: [],
      },
    ])
    expect(result.steps[0].readyCrafts).toBe(10)
  })

  test('an owned intermediate is a done step, by the step that uses it', async () => {
    const item = await ids()
    const result = plan(
      await getRecipeGraph(),
      state({ targets: [{ itemId: item.plank, quantity: 10 }], owned: { [item.stripped]: 25 } })
    )

    // Nothing to gather, but what went into the stripped wood still shows:
    // 20 stripped wood, 20 logs, 10 trunks
    expect(result.materials).toEqual([
      {
        itemId: item.trunk,
        needed: 0,
        owned: 0,
        missing: 0,
        approximate: false,
        covered: 10,
        coveredBy: [item.stripped],
      },
    ])
    expect(
      result.steps.map((s) => [s.itemId, s.round, s.done, s.quantity, s.crafts, s.readyCrafts])
    ).toEqual([
      [item.plank, 1, false, 10, 10, 10],
      // What the plan takes of it, nothing to make
      [item.stripped, 1, true, 20, 0, 0],
    ])
  })

  test('the world gives it as it is: gathered, unless a recipe is chosen', async () => {
    const tables = fixtureTables()
    // Logs straight from a tree, besides splitting a trunk
    tables.extraction_recipe_desc.push({
      id: 7010,
      verb_phrase: 'Chop',
      level_requirements: [{ skill_id: 2, level: 1 }],
      tool_requirements: [],
      extracted_item_stacks: [
        { item_stack: { item_id: 1010, quantity: 1, item_type: 'Item' }, probability: 1 },
      ],
    })
    await importTables(tables)
    const item = await ids()
    const split = await findRecipe('crafting', 100)
    const graph = await getRecipeGraph()

    const gathered = plan(graph, state({ targets: [{ itemId: item.plank, quantity: 10 }] }))
    expect(gathered.materials.map((m) => [m.itemId, m.needed])).toEqual([[item.log, 20]])
    expect(gathered.trees[0].children[0].children[0].reason).toBe('gathered')
    expect(gathered.steps.map((s) => s.itemId)).toEqual([item.stripped, item.plank])

    const crafted = plan(
      graph,
      state({ targets: [{ itemId: item.plank, quantity: 10 }], choices: { [item.log]: split.id } })
    )
    expect(crafted.materials.map((m) => m.itemId)).toEqual([item.trunk])
  })

  test('the same item in two trees is one step', async () => {
    const item = await ids()
    const result = plan(
      await getRecipeGraph(),
      state({
        targets: [
          { itemId: item.plank, quantity: 2 },
          { itemId: item.stripped, quantity: 3 },
        ],
      })
    )

    const stripped = result.steps.filter((s) => s.itemId === item.stripped)
    expect(stripped).toHaveLength(1)
    expect(stripped[0].quantity).toBe(4 + 3)
    expect(stripped[0].crafts).toBe(7)
  })

  test('does not pick scrap recipes by default but offers them', async () => {
    const item = await ids()
    const result = plan(
      await getRecipeGraph(),
      state({ targets: [{ itemId: item.scraps, quantity: 3 }] })
    )

    const [tree] = result.trees
    expect(tree.reason).toBe('no_recipe')
    expect(tree.alternatives).toHaveLength(1)
  })

  test('ignores a choice that does not make the item, with a warning', async () => {
    const item = await ids()
    const result = plan(
      await getRecipeGraph(),
      state({ targets: [{ itemId: item.plank, quantity: 1 }], choices: { [item.plank]: 999_999 } })
    )

    expect(result.trees[0].recipeId).not.toBeNull()
    expect(result.warnings).toHaveLength(1)
  })

  test('cuts cycles and reports them', async () => {
    const tables = fixtureTables()
    tables.crafting_recipe_desc.push({
      ...tables.crafting_recipe_desc[1],
      id: 105,
      name: 'Burn {1} into {0}',
      consumed_item_stacks: [{ item_id: 1030, quantity: 1, item_type: 'Item' }],
      crafted_item_stacks: [{ item_id: 1010, quantity: 1, item_type: 'Item' }],
    })
    await importTables(tables)
    const item = await ids()
    const burn = await findRecipe('crafting', 105)

    const result = plan(
      await getRecipeGraph(),
      state({ targets: [{ itemId: item.log, quantity: 1 }], choices: { [item.log]: burn.id } })
    )

    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('depende de si mesmo')
    expect(result.rawMaterials).toEqual([{ itemId: item.log, quantity: 2, approximate: false }])
  })

  test('the graph knows which skill gathers each item, random lists included', async () => {
    const item = await ids()
    const graph = await getRecipeGraph()

    expect(graph.gatherers.get(item.trunk)).toBe('Forestry')
    // "Rough Wood Log Output" is a list that sometimes gives bark
    expect(graph.gatherers.get(item.bark)).toBe('Forestry')
    expect(graph.gatherers.get(item.plank)).toBeUndefined()
  })

  test('by default, never a recipe that takes an animal no hunt leaves', async () => {
    await importTables(withHunting())
    const pelt = await findItem('item', 9101)
    const cervus = await findItem('cargo', 4)
    const graph = await getRecipeGraph()

    const result = plan(graph, state({ targets: [{ itemId: pelt.id, quantity: 2 }] }))

    // Hunting a Female Cervus leaves a "Cervus": the recipe that takes it wins
    expect(result.trees[0].children[0].itemId).toBe(cervus.id)
    expect(result.materials.map((m) => m.itemId)).toEqual([cervus.id])
    expect(graph.gatherers.get(cervus.id)).toBe('Hunting')
    // The other recipe stays in the dropdown
    expect(result.trees[0].alternatives).toHaveLength(2)
  })

  test('a building: what it takes is planned, building it is the last step', async () => {
    const item = await ids()
    const house = await findRecipe('construction', 50)
    const result = plan(
      await getRecipeGraph(),
      state({ buildings: [{ recipeId: house.id, quantity: 2 }] })
    )

    const [build] = result.builds
    expect(build.quantity).toBe(2)
    expect(build.ready).toBe(false)
    // 10 planks and 2 trunks a house
    expect(build.children.map((c) => [c.itemId, c.needed])).toEqual([
      [item.plank, 20],
      [item.trunk, 4],
    ])
    expect(build.waitingOn.map((w) => [w.itemId, w.crafted])).toEqual([
      [item.plank, true],
      [item.trunk, false],
    ])
    // 20 planks: 40 stripped wood, 40 logs, 20 trunks; plus 4 for the houses
    expect(result.materials.map((m) => [m.itemId, m.needed])).toEqual([[item.trunk, 24]])
    expect(result.effortBySkill.map((e) => e.skill)).toContain('Construction')
  })

  test('a building that left the game is a warning', async () => {
    const result = plan(
      await getRecipeGraph(),
      state({ buildings: [{ recipeId: 999_999, quantity: 1 }] })
    )

    expect(result.builds).toHaveLength(0)
    expect(result.warnings[0]).toContain('não existe nos dados do jogo')
  })

  test('the graph is cached until the next import', async () => {
    const first = await getRecipeGraph()
    expect(await getRecipeGraph()).toBe(first)

    await importTables()
    expect(await getRecipeGraph()).not.toBe(first)
  })
})
