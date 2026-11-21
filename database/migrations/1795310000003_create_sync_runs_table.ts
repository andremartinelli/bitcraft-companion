import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * History of the inventory syncs (button, schedule or `node ace inventory:sync`).
 */
export default class extends BaseSchema {
  protected tableName = 'sync_runs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      // manual or schedule
      table.string('trigger').notNullable()
      table.string('source').notNullable()
      // running, ok, partial or failed
      table.string('status').notNullable()
      table.text('message').nullable()
      table.json('counts').nullable()
      table.timestamp('started_at').notNullable()
      table.timestamp('finished_at').nullable()

      table.index(['status'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
