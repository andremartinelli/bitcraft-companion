import { ExtractionRecipeOutputSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Item from '#models/item'

/** An item a gathering gives (sometimes a random-output list), and how many */
export default class ExtractionRecipeOutput extends ExtractionRecipeOutputSchema {
  @belongsTo(() => Item)
  declare item: BelongsTo<typeof Item>
}
