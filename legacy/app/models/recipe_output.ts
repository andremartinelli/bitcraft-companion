import { RecipeOutputSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Item from '#models/item'
import Recipe from '#models/recipe'

/**
 * What a recipe yields. When `item` is a random output, its item list says
 * what actually comes out and with which chance.
 */
export default class RecipeOutput extends RecipeOutputSchema {
  @belongsTo(() => Recipe)
  declare recipe: BelongsTo<typeof Recipe>

  @belongsTo(() => Item)
  declare item: BelongsTo<typeof Item>
}
