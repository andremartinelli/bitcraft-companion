import { ItemListPossibilityItemSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Item from '#models/item'
import ItemListPossibility from '#models/item_list_possibility'

export default class ItemListPossibilityItem extends ItemListPossibilityItemSchema {
  @belongsTo(() => ItemListPossibility, { foreignKey: 'possibilityId' })
  declare possibility: BelongsTo<typeof ItemListPossibility>

  @belongsTo(() => Item)
  declare item: BelongsTo<typeof Item>
}
