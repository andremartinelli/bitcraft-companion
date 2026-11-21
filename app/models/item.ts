import { ItemSchema } from '#database/schema'
import { belongsTo, hasMany, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import ItemList from '#models/item_list'
import RecipeInput from '#models/recipe_input'
import RecipeOutput from '#models/recipe_output'

export type ItemKind = 'item' | 'cargo'

/**
 * An item or a cargo from the game. Rows are never deleted: when an item
 * leaves the game data it gets `removed_at`.
 */
export default class Item extends ItemSchema {
  declare kind: ItemKind

  static active = scope((query) => {
    query.whereNull('items.removed_at')
  })

  /** Set when this item is a random output ("... Output") */
  @belongsTo(() => ItemList, { foreignKey: 'itemListGameId', localKey: 'gameId' })
  declare itemList: BelongsTo<typeof ItemList>

  @hasMany(() => RecipeInput)
  declare recipeInputs: HasMany<typeof RecipeInput>

  @hasMany(() => RecipeOutput)
  declare recipeOutputs: HasMany<typeof RecipeOutput>
}
