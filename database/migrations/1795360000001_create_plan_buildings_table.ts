import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Buildings a plan builds (a Loom, a Kiln...), next to the items it makes.
 * A building is a construction recipe, not an item: it gets its own table.
 * Recipes are never deleted, so the foreign key stays valid after a patch.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('plan_buildings', (table) => {
      table.increments('id').notNullable()
      table
        .integer('plan_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('plans')
        .onDelete('CASCADE')
      // A construction recipe
      table.integer('recipe_id').unsigned().notNullable().references('id').inTable('recipes')
      table.integer('quantity').notNullable()
      table.integer('position').notNullable().defaultTo(0)

      table.unique(['plan_id', 'recipe_id'])
    })
  }

  async down() {
    this.schema.dropTable('plan_buildings')
  }
}
