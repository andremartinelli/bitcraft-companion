import { InventoryContainerSchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import GamePlayer from '#models/game_player'
import InventoryEntry from '#models/inventory_entry'

export type ContainerKind =
  | 'personal'
  | 'toolbelt'
  | 'wallet'
  | 'bank'
  | 'stash'
  | 'housing'
  | 'claim'
  | 'deployable'
  | 'other'

/** Labels in Portuguese, in the order the inventory page lists them */
export const CONTAINER_KINDS: Record<ContainerKind, string> = {
  personal: 'Mochila',
  toolbelt: 'Cinto',
  wallet: 'Carteira',
  bank: 'Banco',
  stash: 'Settlement Stash',
  housing: 'Casa',
  deployable: 'Veículos e baús portáteis',
  claim: 'Baús da claim',
  other: 'Outros',
}

/**
 * A place where the group keeps items: a player's backpack, bank or cart, or
 * a chest of a claim (shared, no player).
 */
export default class InventoryContainer extends InventoryContainerSchema {
  declare kind: ContainerKind

  @belongsTo(() => GamePlayer)
  declare gamePlayer: BelongsTo<typeof GamePlayer>

  @hasMany(() => InventoryEntry, { foreignKey: 'containerId' })
  declare entries: HasMany<typeof InventoryEntry>

  get kindLabel() {
    return CONTAINER_KINDS[this.kind] ?? this.kind
  }
}
