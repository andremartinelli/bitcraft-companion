import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'game_data_imports'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('source').notNullable()
      table.string('commit_sha').nullable()
      table.timestamp('source_date').nullable()
      table.json('counts').nullable()
      table.json('renamed').nullable()
      table.timestamp('finished_at').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
