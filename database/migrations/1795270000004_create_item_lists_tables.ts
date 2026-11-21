import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Random outputs ("Rough Wood Log Output"): a list has possibilities, each
 * with a probability and the items it yields.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('item_lists', (table) => {
      table.increments('id').notNullable()
      table.bigInteger('game_id').notNullable().unique()
      table.string('name').notNullable()
      table.timestamp('removed_at').nullable()
      table
        .integer('last_import_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('game_data_imports')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })

    this.schema.createTable('item_list_possibilities', (table) => {
      table.increments('id').notNullable()
      table
        .integer('item_list_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('item_lists')
        .onDelete('CASCADE')
      table.double('probability').notNullable()
    })

    this.schema.createTable('item_list_possibility_items', (table) => {
      table.increments('id').notNullable()
      table
        .integer('possibility_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('item_list_possibilities')
        .onDelete('CASCADE')
      table.integer('item_id').unsigned().notNullable().references('id').inTable('items')
      table.integer('quantity').notNullable()

      table.index(['item_id'])
    })
  }

  async down() {
    this.schema.dropTable('item_list_possibility_items')
    this.schema.dropTable('item_list_possibilities')
    this.schema.dropTable('item_lists')
  }
}
