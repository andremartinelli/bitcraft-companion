import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Item from '#models/item'
import Recipe from '#models/recipe'
import RecipeGraph from '#services/calculator/recipe_graph'
import { plan, type CalculatorState } from '#services/calculator/production_planner'
import { fixtureTables, importTables } from '#tests/helpers/game_data'

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

  test('the graph is cached until the next import', async ({ assert }) => {
    const first = await RecipeGraph.current()
    assert.strictEqual(await RecipeGraph.current(), first)

    await importTables()
    assert.notStrictEqual(await RecipeGraph.current(), first)
  })
})
