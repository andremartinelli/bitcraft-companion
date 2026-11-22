import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Hunting gives items too: a hunted animal (enemy_desc) leaves its body,
 * like a tree leaves its trunk. It joins the gatherings, told apart by
 * `source`: the game ids of resources and enemies overlap.
 */
export default class extends BaseSchema {
  protected tableName = 'extraction_recipes'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // resource (a tree, a vein, a plant) or enemy (a hunted animal)
      table.string('source').notNullable().defaultTo('resource')
      table.dropUnique(['game_id'])
      table.unique(['source', 'game_id'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['source', 'game_id'])
      table.unique(['game_id'])
      table.dropColumn('source')
    })
  }
}
