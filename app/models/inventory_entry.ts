import { InventoryEntrySchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import InventoryContainer from '#models/inventory_container'
import Item from '#models/item'

export type EntrySource = 'sync' | 'manual'

/**
 * How many of an item a container holds. Pockets with the same item are summed.
 */
export default class InventoryEntry extends InventoryEntrySchema {
  declare source: EntrySource

  @belongsTo(() => InventoryContainer, { foreignKey: 'containerId' })
  declare container: BelongsTo<typeof InventoryContainer>

  @belongsTo(() => Item)
  declare item: BelongsTo<typeof Item>
}
