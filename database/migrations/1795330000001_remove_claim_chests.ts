import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The group has no access to the settlement's (claim) chests, so the sync
 * stopped reading them. This drops the ones earlier syncs stored. The
 * Settlement Stash is each player's own and stays.
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      const claimChests = db.from('inventory_containers').where('kind', 'claim').select('id')
      await db.from('inventory_entries').whereIn('container_id', claimChests).delete()
      await db.from('inventory_containers').where('kind', 'claim').delete()
    })
  }

  async down() {
    // Nothing to restore: a sync with claim chests on reads them again
  }
}
