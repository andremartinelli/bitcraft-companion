import { PlanOwnedItemSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Item from '#models/item'

export default class PlanOwnedItem extends PlanOwnedItemSchema {
  @belongsTo(() => Item)
  declare item: BelongsTo<typeof Item>
}
