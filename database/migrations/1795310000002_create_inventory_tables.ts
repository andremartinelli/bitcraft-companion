import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Where the group keeps things (backpack, bank, claim chests, carts...) and
 * what is inside each one, as of the last sync.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('inventory_containers', (table) => {
      table.increments('id').notNullable()
      // personal, toolbelt, wallet, bank, stash, housing, claim, deployable or other
      table.string('kind').notNullable()
      // entityId of the inventory or of the building, as BitJita sends it
      table.string('game_entity_id').notNullable()
      // null for claim chests: they belong to the whole group
      table
        .integer('game_player_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('game_players')
        .onDelete('CASCADE')
      table.string('claim_entity_id').nullable()
      table.string('claim_name').nullable()
      table.string('name').notNullable()
      table.timestamp('last_seen_at').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['kind', 'game_entity_id'])
      table.index(['claim_entity_id'])
    })

    this.schema.createTable('inventory_entries', (table) => {
      table.increments('id').notNullable()
      table
        .integer('container_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('inventory_containers')
        .onDelete('CASCADE')
      table.integer('item_id').unsigned().notNullable().references('id').inTable('items')
      table.integer('quantity').notNullable()
      // sync now; manual entries may come later
      table.string('source').notNullable().defaultTo('sync')
      table.timestamp('synced_at').nullable()

      table.unique(['container_id', 'item_id', 'source'])
      table.index(['item_id'])
    })
  }

  async down() {
    this.schema.dropTable('inventory_entries')
    this.schema.dropTable('inventory_containers')
  }
}
