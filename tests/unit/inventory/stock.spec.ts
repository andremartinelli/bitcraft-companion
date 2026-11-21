import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import GamePlayer from '#models/game_player'
import RecipeGraph from '#services/calculator/recipe_graph'
import InventorySync from '#services/game_sync/inventory_sync'
import { ANY_PROFESSION, inventoryListing, NO_PROFESSION } from '#services/inventory/stock'
import { fixtureTables, importTables } from '#tests/helpers/game_data'
import { bitjitaSource, PLAYER_ONE, PLAYER_TWO } from '#tests/helpers/bitjita'

const summary = (sections: Awaited<ReturnType<typeof inventoryListing>>['sections']) =>
  sections.map((section) => ({
    title: section.title,
    items: section.lines.map((line) => `${line.item.name}: ${line.quantity}`),
  }))

test.group('Inventory listing', (group) => {
  group.each.setup(async () => {
    const rollback = await testUtils.db().withGlobalTransaction()
    await importTables()
    RecipeGraph.invalidate()
    await GamePlayer.createMany([PLAYER_ONE, PLAYER_TWO])
    await new InventorySync(bitjitaSource()).run('manual')
    return rollback
  })
  group.each.teardown(() => RecipeGraph.invalidate())

  test('by profession: the skill of the recipe that makes each item', async ({ assert }) => {
    const { sections } = await inventoryListing('professions')

    assert.deepEqual(summary(sections), [
      {
        title: 'Carpentry',
        items: [
          'Rough Plank: 168',
          'Rough Stripped Wood: 25',
          // Only a Scrap recipe makes it: still Carpentry
          'Rough Wood Scraps: 10',
          'Simple Plank: 2',
        ],
      },
      { title: 'Forestry', items: ['Rough Tree Bark: 10', 'Rough Wood Log: 27'] },
      { title: NO_PROFESSION, items: ['Rough Wood Trunk: 7'] },
    ])
  })

  test('recipes of the game skill "ANY" go under "Qualquer profissão"', async ({ assert }) => {
    const tables = fixtureTables()
    tables.crafting_recipe_desc.find((recipe) => recipe.id === 104)!.level_requirements = [
      { skill_id: 1, level: 1 },
    ]
    await importTables(tables)

    const { sections } = await inventoryListing('professions')

    assert.deepEqual(
      sections.map((section) => section.title),
      ['Carpentry', 'Forestry', ANY_PROFESSION, NO_PROFESSION]
    )
    assert.deepEqual(
      sections[2].lines.map((line) => line.item.name),
      ['Simple Plank']
    )
  })

  test('each line says where the item is and whose it is', async ({ assert }) => {
    const { sections } = await inventoryListing('professions', 'rough plank')
    const plank = sections[0].lines[0]

    assert.equal(plank.item.name, 'Rough Plank')
    assert.deepEqual(plank.where, [
      { container: 'Baú de madeira', owner: 'Claim Vila Teste', quantity: 100 },
      { container: 'Settlement Stash', owner: 'Nimbus', quantity: 40 },
      { container: 'Depósito A', owner: 'Quartz', quantity: 12 },
      { container: 'Banco', owner: 'Nimbus', quantity: 10 },
      { container: 'Settlement Stash', owner: 'Quartz', quantity: 6 },
    ])
  })

  test('per player: only what is theirs, without the claim chests', async ({ assert }) => {
    const { sections } = await inventoryListing('players', 'rough plank')

    assert.deepEqual(summary(sections), [
      { title: 'Nimbus', items: ['Rough Plank: 50'] },
      { title: 'Quartz', items: ['Rough Plank: 18'] },
    ])
  })
})
