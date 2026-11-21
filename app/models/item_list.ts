import { ItemListSchema } from '#database/schema'
import { hasMany, scope } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import ItemListPossibility from '#models/item_list_possibility'

/**
 * A random output: each possibility has a probability and the items it yields.
 */
export default class ItemList extends ItemListSchema {
  static active = scope((query) => {
    query.whereNull('item_lists.removed_at')
  })

  @hasMany(() => ItemListPossibility)
  declare possibilities: HasMany<typeof ItemListPossibility>
}
