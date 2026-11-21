import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Each app user's own BitCraft access token, encrypted with APP_KEY.
 * One per user; the token is never shown back to anyone.
 */
export default class extends BaseSchema {
  protected tableName = 'game_credentials'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .unique()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.text('token_encrypted').notNullable()
      table.string('game_username').nullable()
      table.string('identity').nullable()
      table.text('last_error').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
