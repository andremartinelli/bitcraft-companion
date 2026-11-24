import { RecipeSchema } from '#database/schema'
import { belongsTo, hasMany, scope } from '@adonisjs/lucid/orm'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import db from '@adonisjs/lucid/services/db'
import BuildingType from '#models/building_type'
import RecipeInput from '#models/recipe_input'
import RecipeOutput from '#models/recipe_output'
import Skill from '#models/skill'
import ToolType from '#models/tool_type'

export type RecipeKind = 'crafting' | 'construction'

/**
 * Recipes that take things apart, rebuild gear or (un)pack goods. They are
 * almost half of all recipes, so lists hide them unless asked.
 */
export const HIDDEN_VERBS = [
  'Scrap',
  'Recraft',
  'Unpack',
  'Package',
  'Pack',
  'Reforge',
  'Salvage',
  'Revert',
]

export interface RecipeFilters {
  q?: string
  kind?: RecipeKind
  skill?: number
  station?: number
  tier?: number
  verb?: string
  all?: boolean
}

type RecipeQuery = ModelQueryBuilderContract<typeof Recipe>

const likePattern = (word: string) => `%${word.replace(/[%_\\]/g, '\\$&')}%`

/**
 * A crafting or construction recipe. Rows are never deleted: when a recipe
 * leaves the game data it gets `removed_at`.
 */
export default class Recipe extends RecipeSchema {
  declare kind: RecipeKind

  static active = scope((query) => {
    query.whereNull('recipes.removed_at')
  })

  /**
   * Everything a recipe list shows: requirements, ingredients and outputs,
   * with random outputs expanded into their possibilities.
   */
  static withDetails = scope((query: RecipeQuery) => {
    query
      .preload('skill')
      .preload('toolType')
      .preload('buildingType')
      .preload('inputs', (inputs) => inputs.preload('item').orderBy('id'))
      .preload('outputs', (outputs) =>
        outputs
          .orderBy('id')
          .preload('item', (item) =>
            item.preload('itemList', (list) =>
              list.preload('possibilities', (possibilities) =>
                possibilities
                  .orderBy('id')
                  .preload('items', (items) => items.orderBy('id').preload('item'))
              )
            )
          )
      )
  })

  /**
   * Text search matches the recipe name, an ingredient or anything it can
   * produce (including the contents of random outputs). Every word must match.
   */
  static search = scope<typeof Recipe, (query: RecipeQuery, filters: RecipeFilters) => void>(
    (query, filters) => {
      query.where('recipes.kind', filters.kind ?? 'crafting')

      if (filters.verb) query.where('recipes.verb', filters.verb)
      else if (!filters.all) query.whereNotIn('recipes.verb', HIDDEN_VERBS)

      if (filters.skill) query.where('recipes.skill_id', filters.skill)
      if (filters.station) query.where('recipes.building_type_id', filters.station)
      if (filters.tier !== undefined) query.where('recipes.building_tier', filters.tier)

      const words = (filters.q ?? '').toLowerCase().split(/\s+/).filter(Boolean)
      for (const word of words) {
        const pattern = likePattern(word)
        query.where((match) => {
          match
            .whereRaw(`recipes.name LIKE ? ESCAPE '\\'`, [pattern])
            .orWhereExists((sub) =>
              sub
                .from('recipe_inputs as ri')
                .join('items as i', 'i.id', 'ri.item_id')
                .whereColumn('ri.recipe_id', 'recipes.id')
                .whereRaw(`i.name LIKE ? ESCAPE '\\'`, [pattern])
            )
            .orWhereExists((sub) =>
              sub
                .from('recipe_outputs as ro')
                .join('items as o', 'o.id', 'ro.item_id')
                .leftJoin('item_lists as l', 'l.game_id', 'o.item_list_game_id')
                .leftJoin('item_list_possibilities as p', 'p.item_list_id', 'l.id')
                .leftJoin('item_list_possibility_items as pi', 'pi.possibility_id', 'p.id')
                .leftJoin('items as li', 'li.id', 'pi.item_id')
                .whereColumn('ro.recipe_id', 'recipes.id')
                .where((names) =>
                  names
                    .whereRaw(`o.name LIKE ? ESCAPE '\\'`, [pattern])
                    .orWhereRaw(`li.name LIKE ? ESCAPE '\\'`, [pattern])
                )
            )
        })
      }

      query.orderBy('recipes.name').orderBy('recipes.id')
    }
  )

  /**
   * Values for the filter dropdowns, from the active recipes of one kind.
   */
  static async filterOptions(kind: RecipeKind) {
    const base = () =>
      db.from('recipes').whereNull('recipes.removed_at').where('recipes.kind', kind)

    const [skills, stations, verbs, tiers] = await Promise.all([
      base()
        .join('skills', 'skills.id', 'recipes.skill_id')
        .distinct('skills.id', 'skills.name')
        .orderBy('skills.name'),
      base()
        .join('building_types as b', 'b.id', 'recipes.building_type_id')
        .distinct('b.id', 'b.name')
        .orderBy('b.name'),
      base().distinct('recipes.verb as verb').orderBy('verb'),
      base()
        .whereNotNull('recipes.building_tier')
        .distinct('recipes.building_tier as tier')
        .orderBy('tier'),
    ])

    return {
      skills: skills as { id: number; name: string }[],
      stations: stations as { id: number; name: string }[],
      verbs: (verbs as { verb: string }[]).map((row) => row.verb),
      tiers: (tiers as { tier: number }[]).map((row) => row.tier),
    }
  }

  @belongsTo(() => Skill)
  declare skill: BelongsTo<typeof Skill>

  @belongsTo(() => ToolType)
  declare toolType: BelongsTo<typeof ToolType>

  @belongsTo(() => BuildingType)
  declare buildingType: BelongsTo<typeof BuildingType>

  @hasMany(() => RecipeInput)
  declare inputs: HasMany<typeof RecipeInput>

  @hasMany(() => RecipeOutput)
  declare outputs: HasMany<typeof RecipeOutput>
}
