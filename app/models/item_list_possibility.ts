import { ItemListPossibilitySchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import ItemList from '#models/item_list'
import ItemListPossibilityItem from '#models/item_list_possibility_item'

export default class ItemListPossibility extends ItemListPossibilitySchema {
  @belongsTo(() => ItemList)
  declare itemList: BelongsTo<typeof ItemList>

  @hasMany(() => ItemListPossibilityItem, { foreignKey: 'possibilityId' })
  declare items: HasMany<typeof ItemListPossibilityItem>
}
