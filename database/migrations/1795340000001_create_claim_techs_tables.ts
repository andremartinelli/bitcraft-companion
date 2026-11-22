import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The settlement researches (claim_tech_desc): tier upgrades, Township and
 * Homestead, profession stations... Each takes items and supplies. Like the
 * rest of the game data, rows leaving the game get `removed_at`.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('claim_techs', (table) => {
      table.increments('id').notNullable()
      table.integer('game_id').notNullable().unique()
      table.string('name').notNullable()
      table.text('description').nullable()
      table.integer('tier').notNullable()
      // TierUpgrade, Settlement (Township), Homestead, Carpentry, MemberCount...
      table.string('tech_type').notNullable()
      // Settlement supplies, which are not an item
      table.integer('supplies_cost').notNullable().defaultTo(0)
      // Not shown in the game, or cannot be researched
      table.boolean('hidden').notNullable().defaultTo(false)
      table.timestamp('removed_at').nullable()
      table
        .integer('last_import_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('game_data_imports')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['tech_type', 'tier'])
    })

    this.schema.createTable('claim_tech_inputs', (table) => {
      table.increments('id').notNullable()
      table
        .integer('claim_tech_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('claim_techs')
        .onDelete('CASCADE')
      table.integer('item_id').unsigned().notNullable().references('id').inTable('items')
      table.integer('quantity').notNullable()
    })
  }

  async down() {
    this.schema.dropTable('claim_tech_inputs')
    this.schema.dropTable('claim_techs')
  }
}
