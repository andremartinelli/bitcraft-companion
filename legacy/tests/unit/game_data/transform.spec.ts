import { test } from '@japa/runner'
import {
  GameDataFormatError,
  resolveRecipeName,
  toCraftingRecipeRows,
  verbOf,
} from '#services/game_data/transform'
import { fixtureTables } from '#tests/helpers/game_data'

test.group('Game data transform', () => {
  test('resolves {0} to the first output and {1} to the first input', ({ assert }) => {
    assert.equal(
      resolveRecipeName('Split {1} into {0}', 'Rough Wood Log Output', 'Rough Wood Trunk'),
      'Split Rough Wood Trunk into Rough Wood Log Output'
    )
    assert.equal(resolveRecipeName('Craft {0}', 'Simple Plank'), 'Craft Simple Plank')
  })

  test('takes the verb from the first word of the template', ({ assert }) => {
    assert.equal(verbOf('Revert to {0}'), 'Revert')
    assert.equal(verbOf('Scrap {1}'), 'Scrap')
  })

  test('stops on a recipe with two skill requirements', ({ assert }) => {
    const [recipe] = fixtureTables().crafting_recipe_desc
    recipe.level_requirements.push({ skill_id: 3, level: 1 })

    assert.throws(() => toCraftingRecipeRows([recipe], new Map()), GameDataFormatError)
    assert.throws(() => toCraftingRecipeRows([recipe], new Map()), /crafting 100/)
  })
})
