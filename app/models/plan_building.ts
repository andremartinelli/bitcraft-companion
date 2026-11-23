import { PlanBuildingSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Recipe from '#models/recipe'

/** A building a plan builds: a construction recipe, and how many */
export default class PlanBuilding extends PlanBuildingSchema {
  @belongsTo(() => Recipe)
  declare recipe: BelongsTo<typeof Recipe>
}
