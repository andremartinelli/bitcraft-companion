import { ExtractionRecipeSchema } from '#database/schema'
import { belongsTo, hasMany, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import ExtractionRecipeOutput from '#models/extraction_recipe_output'
import Skill from '#models/skill'

/**
 * Gathering in the world (chop, mine, pick...): the skill it takes and the
 * items it gives.
 */
export default class ExtractionRecipe extends ExtractionRecipeSchema {
  static active = scope((query) => {
    query.whereNull('extraction_recipes.removed_at')
  })

  @belongsTo(() => Skill)
  declare skill: BelongsTo<typeof Skill>

  @hasMany(() => ExtractionRecipeOutput)
  declare outputs: HasMany<typeof ExtractionRecipeOutput>
}
