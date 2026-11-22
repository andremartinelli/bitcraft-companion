import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Item from '#models/item'
import Recipe from '#models/recipe'
import RecipeGraph from '#services/calculator/recipe_graph'
import { plan, type CalculatorState } from '#services/calculator/production_planner'
import { fixtureTables, importTables, withHunting } from '#tests/helpers/game_data'

const ids = async () => {
  const find = async (kind: 'item' | 'cargo', gameId: number) => {
    const found = await Item.findByOrFail({ kind, gameId })
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

test.group('Production planner', (group) => {
  group.each.setup(async () => {
    const rollback = await testUtils.db().withGlobalTransaction()
    await importTables()
    return rollback
  })

  test('expands 10 Rough Plank down to Rough Wood Trunk', async ({ assert }) => {
    const item = await ids()
    const result = plan(
      await RecipeGraph.current(),
      state({ targets: [{ itemId: item.plank, quantity: 10 }] })
    )

    assert.deepEqual(result.rawMaterials, [
      { itemId: item.trunk, quantity: 10, approximate: false },
    ])
    assert.deepEqual(result.effortBySkill, [
      { skill: 'Carpentry', actions: 10 * 40 + 20 * 30 },
      { skill: 'Forestry', actions: 10 * 20 },
    ])
    const [tree] = result.trees
    assert.equal(tree.crafts, 10)
    assert.equal(tree.children[0].itemId, item.stripped)
    assert.equal(tree.children[0].needed, 20)
  })

  test('a random output item can be a target itself', async ({ assert }) => {
    const output = await Item.findByOrFail({ kind: 'item', gameId: 1040 })
    const item = await ids()
    const result = plan(
      await RecipeGraph.current(),
      state({ targets: [{ itemId: output.id, quantity: 3 }] })
    )

    const [tree] = result.trees
    assert.equal(tree.reason, null)
    assert.equal(tree.crafts, 3)
    assert.deepEqual(result.rawMaterials, [{ itemId: item.trunk, quantity: 3, approximate: false }])
  })

  test('uses expected values for random outputs', async ({ assert }) => {
    const item = await ids()
    const result = plan(
      await RecipeGraph.current(),
      state({ targets: [{ itemId: item.bark, quantity: 1 }] })
    )

    const [tree] = result.trees
    assert.isTrue(tree.approximate)
    assert.equal(tree.crafts, 4)
    assert.deepEqual(result.rawMaterials, [{ itemId: item.trunk, quantity: 4, approximate: true }])
  })

  test('stops at an item chosen as raw material', async ({ assert }) => {
    const item = await ids()
    const result = plan(
      await RecipeGraph.current(),
      state({
        targets: [{ itemId: item.plank, quantity: 10 }],
        choices: { [item.stripped]: 'raw' },
      })
    )

    assert.deepEqual(result.rawMaterials, [
      { itemId: item.stripped, quantity: 20, approximate: false },
    ])
    assert.equal(result.trees[0].children[0].reason, 'raw')
  })

  test('owning more than needed removes the step and never goes negative', async ({ assert }) => {
    const item = await ids()
    const result = plan(
      await RecipeGraph.current(),
      state({ targets: [{ itemId: item.plank, quantity: 10 }], owned: { [item.stripped]: 25 } })
    )

    const stripped = result.trees[0].children[0]
    assert.equal(stripped.fromOwned, 20)
    assert.equal(stripped.missing, 0)
    assert.equal(stripped.reason, 'owned')
    assert.lengthOf(stripped.children, 0)
    assert.deepEqual(result.rawMaterials, [])
  })

  test('sums repeated targets and uses what you own only once', async ({ assert }) => {
    const item = await ids()
    const result = plan(
      await RecipeGraph.current(),
      state({
        targets: [
          { itemId: item.plank, quantity: 4 },
          { itemId: item.plank, quantity: 6 },
          { itemId: item.stripped, quantity: 5 },
        ],
        owned: { [item.stripped]: 22 },
      })
    )

    assert.lengthOf(result.trees, 2)
    assert.equal(result.trees[0].needed, 10)
    // planks take 20 of the 22 owned; the 5 stripped target gets the last 2 and makes 3
    assert.equal(result.trees[1].fromOwned, 2)
    assert.equal(result.trees[1].missing, 3)
    assert.deepEqual(result.rawMaterials, [{ itemId: item.trunk, quantity: 2, approximate: false }])
  })

  test('lists the steps in rounds, each waiting on what it needs', async ({ assert }) => {
    const item = await ids()
    const result = plan(
      await RecipeGraph.current(),
      state({ targets: [{ itemId: item.plank, quantity: 10 }] })
    )

    assert.deepEqual(
      result.steps.map((s) => [s.itemId, s.round, s.quantity, s.crafts, s.readyCrafts]),
      [
        [item.log, 1, 20, 10, 0],
        [item.stripped, 2, 20, 20, 0],
        [item.plank, 3, 10, 10, 0],
      ]
    )
    assert.deepEqual(result.steps[0].waitingOn, [
      { itemId: item.trunk, missing: 10, crafted: false },
    ])
    assert.deepEqual(result.steps[2].waitingOn, [
      { itemId: item.stripped, missing: 20, crafted: true },
    ])
    assert.deepEqual(result.materials, [
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

  test('the inputs they have make part of a step ready now', async ({ assert }) => {
    const item = await ids()
    const result = plan(
      await RecipeGraph.current(),
      state({ targets: [{ itemId: item.plank, quantity: 10 }], owned: { [item.trunk]: 4 } })
    )

    const split = result.steps.find((s) => s.itemId === item.log)!
    assert.equal(split.crafts, 10)
    assert.equal(split.readyCrafts, 4)
    assert.deepEqual(result.materials, [
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

  test('a raw material they have in full stays in the list, complete', async ({ assert }) => {
    const item = await ids()
    const result = plan(
      await RecipeGraph.current(),
      state({ targets: [{ itemId: item.plank, quantity: 10 }], owned: { [item.trunk]: 15 } })
    )

    assert.deepEqual(result.rawMaterials, [])
    assert.deepEqual(result.materials, [
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
    assert.equal(result.steps[0].readyCrafts, 10)
  })

  test('an owned intermediate is a done step, by the step that uses it', async ({ assert }) => {
    const item = await ids()
    const result = plan(
      await RecipeGraph.current(),
      state({ targets: [{ itemId: item.plank, quantity: 10 }], owned: { [item.stripped]: 25 } })
    )

    // Nothing to gather, but what went into the stripped wood still shows:
    // 20 stripped wood, 20 logs, 10 trunks
    assert.deepEqual(result.materials, [
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
    assert.deepEqual(
      result.steps.map((s) => [s.itemId, s.round, s.done, s.quantity, s.crafts, s.readyCrafts]),
      [
        [item.plank, 1, false, 10, 10, 10],
        // What the plan takes of it, nothing to make
        [item.stripped, 1, true, 20, 0, 0],
      ]
    )
  })

  test('the world gives it as it is: gathered, unless a recipe is chosen', async ({ assert }) => {
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
    const split = await Recipe.findByOrFail({ kind: 'crafting', gameId: 100 })
    const graph = await RecipeGraph.current()

    const gathered = plan(graph, state({ targets: [{ itemId: item.plank, quantity: 10 }] }))
    assert.deepEqual(
      gathered.materials.map((m) => [m.itemId, m.needed]),
      [[item.log, 20]]
    )
    assert.equal(gathered.trees[0].children[0].children[0].reason, 'gathered')
    assert.deepEqual(
      gathered.steps.map((s) => s.itemId),
      [item.stripped, item.plank]
    )

    const crafted = plan(
      graph,
      state({ targets: [{ itemId: item.plank, quantity: 10 }], choices: { [item.log]: split.id } })
    )
    assert.deepEqual(
      crafted.materials.map((m) => m.itemId),
      [item.trunk]
    )
  })

  test('the same item in two trees is one step', async ({ assert }) => {
    const item = await ids()
    const result = plan(
      await RecipeGraph.current(),
      state({
        targets: [
          { itemId: item.plank, quantity: 2 },
          { itemId: item.stripped, quantity: 3 },
        ],
      })
    )

    const stripped = result.steps.filter((s) => s.itemId === item.stripped)
    assert.lengthOf(stripped, 1)
    assert.equal(stripped[0].quantity, 4 + 3)
    assert.equal(stripped[0].crafts, 7)
  })

  test('does not pick scrap recipes by default but offers them', async ({ assert }) => {
    const item = await ids()
    const result = plan(
      await RecipeGraph.current(),
      state({ targets: [{ itemId: item.scraps, quantity: 3 }] })
    )

    const [tree] = result.trees
    assert.equal(tree.reason, 'no_recipe')
    assert.lengthOf(tree.alternatives, 1)
  })

  test('ignores a choice that does not make the item, with a warning', async ({ assert }) => {
    const item = await ids()
    const result = plan(
      await RecipeGraph.current(),
      state({ targets: [{ itemId: item.plank, quantity: 1 }], choices: { [item.plank]: 999_999 } })
    )

    assert.isNotNull(result.trees[0].recipeId)
    assert.lengthOf(result.warnings, 1)
  })

  test('cuts cycles and reports them', async ({ assert }) => {
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
    const burn = await Recipe.findByOrFail({ kind: 'crafting', gameId: 105 })

    const result = plan(
      await RecipeGraph.current(),
      state({ targets: [{ itemId: item.log, quantity: 1 }], choices: { [item.log]: burn.id } })
    )

    assert.lengthOf(result.warnings, 1)
    assert.include(result.warnings[0], 'depende de si mesmo')
    assert.deepEqual(result.rawMaterials, [{ itemId: item.log, quantity: 2, approximate: false }])
  })

  test('the graph knows which skill gathers each item, random lists included', async ({
    assert,
  }) => {
    const item = await ids()
    const graph = await RecipeGraph.current()

    assert.equal(graph.gatherers.get(item.trunk), 'Forestry')
    // "Rough Wood Log Output" is a list that sometimes gives bark
    assert.equal(graph.gatherers.get(item.bark), 'Forestry')
    assert.isUndefined(graph.gatherers.get(item.plank))
  })

  test('by default, never a recipe that takes an animal no hunt leaves', async ({ assert }) => {
    await importTables(withHunting())
    const pelt = await Item.findByOrFail({ kind: 'item', gameId: 9101 })
    const cervus = await Item.findByOrFail({ kind: 'cargo', gameId: 4 })
    const graph = await RecipeGraph.current()

    const result = plan(graph, state({ targets: [{ itemId: pelt.id, quantity: 2 }] }))

    // Hunting a Female Cervus leaves a "Cervus": the recipe that takes it wins
    assert.equal(result.trees[0].children[0].itemId, cervus.id)
    assert.deepEqual(
      result.materials.map((m) => m.itemId),
      [cervus.id]
    )
    assert.equal(graph.gatherers.get(cervus.id), 'Hunting')
    // The other recipe stays in the dropdown
    assert.lengthOf(result.trees[0].alternatives, 2)
  })

  test('the graph is cached until the next import', async ({ assert }) => {
    const first = await RecipeGraph.current()
    assert.strictEqual(await RecipeGraph.current(), first)

    await importTables()
    assert.notStrictEqual(await RecipeGraph.current(), first)
  })
})
