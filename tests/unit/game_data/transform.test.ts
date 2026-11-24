import { describe, expect, test } from 'vitest'
import {
  GameDataFormatError,
  resolveRecipeName,
  toCraftingRecipeRows,
  verbOf,
} from '@/services/game_data/transform'
import { fixtureTables } from '../../helpers/game_data'

describe('game data transform', () => {
  test('resolves {0} to the first output and {1} to the first input', () => {
    expect(
      resolveRecipeName('Split {1} into {0}', 'Rough Wood Log Output', 'Rough Wood Trunk')
    ).toBe('Split Rough Wood Trunk into Rough Wood Log Output')
    expect(resolveRecipeName('Craft {0}', 'Simple Plank')).toBe('Craft Simple Plank')
  })

  test('takes the verb from the first word of the template', () => {
    expect(verbOf('Revert to {0}')).toBe('Revert')
    expect(verbOf('Scrap {1}')).toBe('Scrap')
  })

  test('stops on a recipe with two skill requirements', () => {
    const [recipe] = fixtureTables().crafting_recipe_desc
    recipe.level_requirements.push({ skill_id: 3, level: 1 })

    expect(() => toCraftingRecipeRows([recipe], new Map())).toThrow(GameDataFormatError)
    expect(() => toCraftingRecipeRows([recipe], new Map())).toThrow(/crafting 100/)
  })
})
