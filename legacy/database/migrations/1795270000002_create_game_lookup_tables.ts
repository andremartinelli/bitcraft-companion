import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Small lookup tables from the game. Their primary key is the game id.
 */
export default class extends BaseSchema {
  async up() {
    for (const tableName of ['skills', 'tool_types', 'building_types']) {
      this.schema.createTable(tableName, (table) => {
        table.integer('id').primary().notNullable()
        table.string('name').notNullable()
      })
    }
  }

  async down() {
    for (const tableName of ['building_types', 'tool_types', 'skills']) {
      this.schema.dropTable(tableName)
    }
  }
}
