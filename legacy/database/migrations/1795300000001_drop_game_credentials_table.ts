import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Player tokens are no longer stored: connecting to the game servers with a
 * player's token counts as a new sign-in and closes that player's game
 * session. Live data comes from public sources instead.
 */
export default class extends BaseSchema {
  protected tableName = 'game_credentials'

  async up() {
    this.schema.dropTableIfExists(this.tableName)
  }

  async down() {
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
}
