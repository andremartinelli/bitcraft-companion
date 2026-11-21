import { RecipeSchema } from '#database/schema'
import { belongsTo, hasMany, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import BuildingType from '#models/building_type'
import RecipeInput from '#models/recipe_input'
import RecipeOutput from '#models/recipe_output'
import Skill from '#models/skill'
import ToolType from '#models/tool_type'

export type RecipeKind = 'crafting' | 'construction'

/**
 * A crafting or construction recipe. Rows are never deleted: when a recipe
 * leaves the game data it gets `removed_at`.
 */
export default class Recipe extends RecipeSchema {
  declare kind: RecipeKind

  static active = scope((query) => {
    query.whereNull('recipes.removed_at')
  })

  @belongsTo(() => Skill)
  declare skill: BelongsTo<typeof Skill>

  @belongsTo(() => ToolType)
  declare toolType: BelongsTo<typeof ToolType>

  @belongsTo(() => BuildingType)
  declare buildingType: BelongsTo<typeof BuildingType>

  @hasMany(() => RecipeInput)
  declare inputs: HasMany<typeof RecipeInput>

  @hasMany(() => RecipeOutput)
  declare outputs: HasMany<typeof RecipeOutput>
}
