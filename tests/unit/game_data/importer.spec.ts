import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Item from '#models/item'
import Recipe from '#models/recipe'
import GameDataImport from '#models/game_data_import'
import { GameDataFormatError } from '#services/game_data/transform'
import { fixtureTables, importTables } from '#tests/helpers/game_data'

test.group('Game data importer', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('imports items and cargo with the same game id as two rows', async ({ assert }) => {
    const summary = await importTables()

    assert.deepEqual(summary.counts, {
      items: 7,
      cargo: 1,
      itemLists: 1,
      craftingRecipes: 5,
      constructionRecipes: 1,
    })
    const same = await Item.query().where('game_id', 1010).orderBy('kind')
    assert.deepEqual(
      same.map((i) => [i.kind, i.name]),
      [
        ['cargo', 'Rough Wood Trunk'],
        ['item', 'Rough Wood Log'],
      ]
    )
  })

  test('stores resolved names, requirements and stacks', async ({ assert }) => {
    await importTables()

    const split = await Recipe.query()
      .where({ kind: 'crafting', game_id: 100 })
      .preload('inputs', (q) => q.preload('item'))
      .preload('skill')
      .preload('buildingType')
      .firstOrFail()
    assert.equal(split.name, 'Split Rough Wood Trunk into Rough Wood Log Output')
    assert.equal(split.verb, 'Split')
    assert.equal(split.skill.name, 'Forestry')
    assert.equal(split.buildingType.name, 'Forestry Station')
    assert.equal(split.inputs[0].item.kind, 'cargo')

    const treat = await Recipe.findByOrFail({ kind: 'crafting', gameId: 102 })
    assert.isNull(treat.toolTypeId)
    assert.isTrue(treat.hiddenWithoutKnowledge)

    const house = await Recipe.query()
      .where({ kind: 'construction', game_id: 50 })
      .preload('inputs')
      .firstOrFail()
    assert.equal(house.name, 'Starter House')
    assert.lengthOf(house.inputs, 2)
  })

  test('skips references to items the game data does not define', async ({ assert }) => {
    const summary = await importTables()

    assert.equal(summary.skipped.missingItems, 1)
    const craft = await Recipe.query().where({ game_id: 104 }).preload('inputs').firstOrFail()
    assert.lengthOf(craft.inputs, 1)
  })

  test('running twice changes nothing', async ({ assert }) => {
    await importTables()
    const second = await importTables()

    assert.deepEqual(second.added, { items: 0, itemLists: 0, recipes: 0 })
    assert.deepEqual(second.removed, { items: 0, itemLists: 0, recipes: 0 })
    assert.lengthOf(await Item.all(), 8)
    assert.lengthOf(await Recipe.all(), 6)
    const craft = await Recipe.query().where({ game_id: 104 }).preload('inputs').firstOrFail()
    assert.lengthOf(craft.inputs, 1)
  })

  test('marks what left the game and restores it when it comes back', async ({ assert }) => {
    await importTables()

    const tables = fixtureTables()
    tables.item_desc = tables.item_desc.filter((item) => item.id !== 1060)
    tables.crafting_recipe_desc = tables.crafting_recipe_desc.filter((r) => r.id !== 103)
    const summary = await importTables(tables)

    assert.deepEqual(summary.removed, { items: 1, itemLists: 0, recipes: 1 })
    const scraps = await Item.findByOrFail({ kind: 'item', gameId: 1060 })
    assert.isNotNull(scraps.removedAt)
    const active = await Recipe.query().withScopes((s) => s.active())
    assert.notInclude(
      active.map((r) => r.gameId),
      103
    )

    await importTables()
    await scraps.refresh()
    assert.isNull(scraps.removedAt)
  })

  test('reports a game id that came back with another name', async ({ assert }) => {
    await importTables()

    const tables = fixtureTables()
    tables.item_desc.find((item) => item.id === 1030)!.name = 'Rough Board'
    const summary = await importTables(tables)

    assert.deepEqual(summary.renamed, [
      { kind: 'item', gameId: 1030, from: 'Rough Plank', to: 'Rough Board' },
    ])
    const record = await GameDataImport.findOrFail(summary.importId)
    assert.deepEqual(record.renamed, summary.renamed)
  })

  test('a format error writes nothing', async ({ assert }) => {
    const tables = fixtureTables()
    tables.crafting_recipe_desc[0].level_requirements.push({ skill_id: 3, level: 1 })

    await assert.rejects(() => importTables(tables), GameDataFormatError)
    assert.lengthOf(await Item.all(), 0)
    assert.lengthOf(await GameDataImport.all(), 0)
  })
})
