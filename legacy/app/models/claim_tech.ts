import { ClaimTechSchema } from '#database/schema'
import { hasMany, scope } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import ClaimTechInput from '#models/claim_tech_input'

/**
 * A settlement research (claim tech): a tier upgrade, a Township or
 * Homestead level, a profession's stations... It takes items and supplies.
 */
export default class ClaimTech extends ClaimTechSchema {
  // Lucid would pluralize the name as "claim_teches"
  static table = 'claim_techs'

  static active = scope((query) => {
    query.whereNull('claim_techs.removed_at')
  })

  @hasMany(() => ClaimTechInput)
  declare inputs: HasMany<typeof ClaimTechInput>
}
