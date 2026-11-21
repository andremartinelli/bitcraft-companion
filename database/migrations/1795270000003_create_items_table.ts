import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Items and cargo from the game, in one table. Their game ids overlap, so
 * they are unique per (kind, game_id).
 */
export default class extends BaseSchema {
  protected tableName = 'items'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('kind').notNullable()
      table.bigInteger('game_id').notNullable()
      table.string('name').notNullable()
      table.text('description').nullable()
      table.integer('tier').notNullable()
      table.string('tag').nullable()
      table.string('rarity').nullable()
      table.bigInteger('item_list_game_id').nullable()
      table.timestamp('removed_at').nullable()
      table
        .integer('last_import_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('game_data_imports')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['kind', 'game_id'])
      table.index(['name'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
