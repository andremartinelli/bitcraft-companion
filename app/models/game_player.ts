import { GamePlayerSchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import InventoryContainer from '#models/inventory_container'
import User from '#models/user'

/**
 * A game character whose inventories the app follows. Identified by the
 * public entity id from BitJita; no player token is involved.
 */
export default class GamePlayer extends GamePlayerSchema {
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @hasMany(() => InventoryContainer)
  declare containers: HasMany<typeof InventoryContainer>
}
