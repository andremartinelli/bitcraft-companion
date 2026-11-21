import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Crafting and construction recipes, unique per (kind, game_id).
 * Every current recipe has one skill, at most one tool and (for crafting)
 * one station, so requirements are plain columns. The importer stops with
 * an error if a patch ever brings more than one of the same type.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('recipes', (table) => {
      table.increments('id').notNullable()
      table.string('kind').notNullable()
      table.bigInteger('game_id').notNullable()
      table.string('name').notNullable()
      table.string('verb').notNullable()
      table.integer('actions_required').notNullable()
      table.double('time_per_action').notNullable()
      table.double('stamina_per_action').notNullable()
      table.integer('skill_id').nullable().references('id').inTable('skills')
      table.integer('skill_level').nullable()
      table.integer('tool_type_id').nullable().references('id').inTable('tool_types')
      table.integer('tool_tier').nullable()
      table.integer('building_type_id').nullable().references('id').inTable('building_types')
      table.integer('building_tier').nullable()
      table.boolean('is_passive').notNullable().defaultTo(false)
      table.boolean('hidden_without_knowledge').notNullable().defaultTo(false)
      table.integer('shards').notNullable().defaultTo(0)
      table.integer('paving_tier').nullable()
      table.timestamp('removed_at').nullable()
      table
        .integer('last_import_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('game_data_imports')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['kind', 'game_id'])
      table.index(['verb'])
      table.index(['skill_id'])
      table.index(['building_type_id'])
    })

    for (const tableName of ['recipe_inputs', 'recipe_outputs']) {
      this.schema.createTable(tableName, (table) => {
        table.increments('id').notNullable()
        table
          .integer('recipe_id')
          .unsigned()
          .notNullable()
          .references('id')
          .inTable('recipes')
          .onDelete('CASCADE')
        table.integer('item_id').unsigned().notNullable().references('id').inTable('items')
        table.integer('quantity').notNullable()

        table.index(['recipe_id'])
        table.index(['item_id'])
      })
    }
  }

  async down() {
    this.schema.dropTable('recipe_outputs')
    this.schema.dropTable('recipe_inputs')
    this.schema.dropTable('recipes')
  }
}
