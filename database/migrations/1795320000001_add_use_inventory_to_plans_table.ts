import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * "Usar inventário do grupo" saved with each plan. On by default: it only
 * takes effect once an inventory sync has written data.
 */
export default class extends BaseSchema {
  protected tableName = 'plans'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('use_inventory').notNullable().defaultTo(true)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('use_inventory')
    })
  }
}
