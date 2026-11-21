import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The game characters whose inventories the app follows. Only public data
 * from BitJita: no player token is ever stored.
 */
export default class extends BaseSchema {
  protected tableName = 'game_players'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('username').notNullable()
      // 18-digit game ids do not fit in a JS number
      table.string('entity_id').notNullable().unique()
      table.integer('region_id').nullable()
      // Claims the character belongs to, as of the last read: [{ entityId, name }]
      table.json('claims').nullable()
      table
        .integer('user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.timestamp('last_synced_at').nullable()
      table.text('last_error').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
