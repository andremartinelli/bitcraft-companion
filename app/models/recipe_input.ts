import { RecipeInputSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Item from '#models/item'
import Recipe from '#models/recipe'

export default class RecipeInput extends RecipeInputSchema {
  @belongsTo(() => Recipe)
  declare recipe: BelongsTo<typeof Recipe>

  @belongsTo(() => Item)
  declare item: BelongsTo<typeof Item>
}
