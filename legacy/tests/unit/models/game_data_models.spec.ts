import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import GameDataImport from '#models/game_data_import'
import Item from '#models/item'
import Recipe from '#models/recipe'
import Skill from '#models/skill'

test.group('Game data models', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('reads booleans and JSON back with their real types', async ({ assert }) => {
    const skill = await Skill.create({ id: 3, name: 'Carpentry' })
    const recipe = await Recipe.create({
      kind: 'crafting',
      gameId: 1,
      name: 'Craft Rough Plank',
      verb: 'Craft',
      actionsRequired: 50,
      timePerAction: 1.6,
      staminaPerAction: 1,
      skillId: skill.id,
      skillLevel: 1,
      isPassive: true,
      hiddenWithoutKnowledge: false,
    })
    const imported = await GameDataImport.create({ source: 'local', counts: { items: 2 } })

    const reloadedRecipe = await Recipe.findOrFail(recipe.id)
    const reloadedImport = await GameDataImport.findOrFail(imported.id)

    assert.strictEqual(reloadedRecipe.isPassive, true)
    assert.strictEqual(reloadedRecipe.hiddenWithoutKnowledge, false)
    assert.deepEqual(reloadedImport.counts, { items: 2 })
  })

  test('active scope hides removed rows', async ({ assert }) => {
    await Item.createMany([
      { kind: 'item', gameId: 1, name: 'Rough Plank', tier: 1 },
      { kind: 'cargo', gameId: 1, name: 'Rough Wood Trunk', tier: 1, removedAt: DateTime.now() },
    ])

    const active = await Item.query().withScopes((s) => s.active())
    const names = active.map((i) => i.name)
    assert.deepEqual(names, ['Rough Plank'])
  })

  test('recipe preloads inputs, outputs and skill', async ({ assert }) => {
    const skill = await Skill.create({ id: 3, name: 'Carpentry' })
    const [stripped, plank] = await Item.createMany([
      { kind: 'item', gameId: 10, name: 'Rough Stripped Wood', tier: 1 },
      { kind: 'item', gameId: 11, name: 'Rough Plank', tier: 1 },
    ])
    const recipe = await Recipe.create({
      kind: 'crafting',
      gameId: 2,
      name: 'Treat Rough Stripped Wood Into Rough Plank',
      verb: 'Treat',
      actionsRequired: 10,
      timePerAction: 1,
      staminaPerAction: 1,
      skillId: skill.id,
      skillLevel: 1,
    })
    await recipe.related('inputs').create({ itemId: stripped.id, quantity: 2 })
    await recipe.related('outputs').create({ itemId: plank.id, quantity: 1 })

    const loaded = await Recipe.query()
      .where('id', recipe.id)
      .preload('skill')
      .preload('inputs', (q) => q.preload('item'))
      .preload('outputs', (q) => q.preload('item'))
      .firstOrFail()

    assert.equal(loaded.skill.name, 'Carpentry')
    assert.equal(loaded.inputs[0].item.name, 'Rough Stripped Wood')
    assert.equal(loaded.outputs[0].item.name, 'Rough Plank')
  })
})
