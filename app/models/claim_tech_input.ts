import { ClaimTechInputSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Item from '#models/item'

/** An item a settlement research takes, and how many */
export default class ClaimTechInput extends ClaimTechInputSchema {
  @belongsTo(() => Item)
  declare item: BelongsTo<typeof Item>
}
