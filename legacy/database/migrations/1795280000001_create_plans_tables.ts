import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Saved calculator plans, shared by everyone who uses the app. Game items and
 * recipes are never deleted, so these foreign keys stay valid after a patch.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('plans', (table) => {
      table.increments('id').notNullable()
      table.string('name', 80).notNullable()
      table.text('notes').nullable()
      table
        .integer('created_by_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table
        .integer('updated_by_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })

    this.schema.createTable('plan_items', (table) => {
      table.increments('id').notNullable()
      table
        .integer('plan_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('plans')
        .onDelete('CASCADE')
      table.integer('item_id').unsigned().notNullable().references('id').inTable('items')
      table.integer('quantity').notNullable()
      table.integer('position').notNullable().defaultTo(0)

      table.unique(['plan_id', 'item_id'])
    })

    this.schema.createTable('plan_choices', (table) => {
      table.increments('id').notNullable()
      table
        .integer('plan_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('plans')
        .onDelete('CASCADE')
      table.integer('item_id').unsigned().notNullable().references('id').inTable('items')
      // null = treat the item as raw material
      table.integer('recipe_id').unsigned().nullable().references('id').inTable('recipes')

      table.unique(['plan_id', 'item_id'])
    })

    this.schema.createTable('plan_owned_items', (table) => {
      table.increments('id').notNullable()
      table
        .integer('plan_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('plans')
        .onDelete('CASCADE')
      table.integer('item_id').unsigned().notNullable().references('id').inTable('items')
      table.integer('quantity').notNullable()

      table.unique(['plan_id', 'item_id'])
    })
  }

  async down() {
    this.schema.dropTable('plan_owned_items')
    this.schema.dropTable('plan_choices')
    this.schema.dropTable('plan_items')
    this.schema.dropTable('plans')
  }
}
