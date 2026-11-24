import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Gathering (extraction_recipe_desc): chopping a tree, mining a vein,
 * picking a plant. Each one takes a skill and gives items, so the plan knows
 * which profession gathers each raw material. Apart from `recipes`, so the
 * recipe pages stay about crafting and building. Like the rest of the game
 * data, rows leaving the game get `removed_at`.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('extraction_recipes', (table) => {
      table.increments('id').notNullable()
      table.integer('game_id').notNullable().unique()
      // Gather, Chop, Mine, Fish...
      table.string('verb').notNullable()
      table.integer('skill_id').nullable().references('id').inTable('skills')
      table.integer('skill_level').nullable()
      table.integer('tool_type_id').nullable().references('id').inTable('tool_types')
      table.integer('tool_tier').nullable()
      table.timestamp('removed_at').nullable()
      table
        .integer('last_import_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('game_data_imports')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['skill_id'])
    })

    this.schema.createTable('extraction_recipe_outputs', (table) => {
      table.increments('id').notNullable()
      table
        .integer('extraction_recipe_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('extraction_recipes')
        .onDelete('CASCADE')
      table.integer('item_id').unsigned().notNullable().references('id').inTable('items')
      table.integer('quantity').notNullable()

      table.index(['item_id'])
    })
  }

  async down() {
    this.schema.dropTable('extraction_recipe_outputs')
    this.schema.dropTable('extraction_recipes')
  }
}
