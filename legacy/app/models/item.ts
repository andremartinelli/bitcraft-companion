import { ItemSchema } from '#database/schema'
import { belongsTo, hasMany, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import db from '@adonisjs/lucid/services/db'
import ItemList from '#models/item_list'
import Recipe from '#models/recipe'
import RecipeInput from '#models/recipe_input'
import RecipeOutput from '#models/recipe_output'

export type ItemKind = 'item' | 'cargo'

export interface ProducingRecipe {
  recipe: Recipe
  /** Expected quantity of this item per craft */
  quantity: number
  /** Chance of getting it at all, when it comes from a random output; null when guaranteed */
  chance: number | null
}

/**
 * An item or a cargo from the game. Rows are never deleted: when an item
 * leaves the game data it gets `removed_at`.
 */
export default class Item extends ItemSchema {
  declare kind: ItemKind

  static active = scope((query) => {
    query.whereNull('items.removed_at')
  })

  /** Set when this item is a random output ("... Output") */
  @belongsTo(() => ItemList, { foreignKey: 'itemListGameId', localKey: 'gameId' })
  declare itemList: BelongsTo<typeof ItemList>

  @hasMany(() => RecipeInput)
  declare recipeInputs: HasMany<typeof RecipeInput>

  @hasMany(() => RecipeOutput)
  declare recipeOutputs: HasMany<typeof RecipeOutput>

  /**
   * Recipes that yield this item, directly or inside a random output.
   */
  async producingRecipes(): Promise<ProducingRecipe[]> {
    const direct: { recipe_id: number; quantity: number }[] = await db
      .from('recipe_outputs')
      .where('item_id', this.id)
      .select('recipe_id', 'quantity')

    const viaLists: { recipe_id: number; out_qty: number; probability: number; qty: number }[] =
      await db
        .from('item_list_possibility_items as pi')
        .join('item_list_possibilities as p', 'p.id', 'pi.possibility_id')
        .join('item_lists as l', 'l.id', 'p.item_list_id')
        .join('items as o', 'o.item_list_game_id', 'l.game_id')
        .join('recipe_outputs as ro', 'ro.item_id', 'o.id')
        .where('pi.item_id', this.id)
        .whereNull('l.removed_at')
        .whereNull('o.removed_at')
        .select('ro.recipe_id', 'ro.quantity as out_qty', 'p.probability', 'pi.quantity as qty')

    const byRecipe = new Map<number, { quantity: number; chance: number | null }>()
    for (const row of direct) {
      const entry = byRecipe.get(row.recipe_id) ?? { quantity: 0, chance: null }
      entry.quantity += row.quantity
      byRecipe.set(row.recipe_id, entry)
    }
    for (const row of viaLists) {
      const entry = byRecipe.get(row.recipe_id) ?? { quantity: 0, chance: 0 }
      entry.quantity += row.probability * row.qty * row.out_qty
      if (entry.chance !== null) entry.chance = Math.min(1, entry.chance + row.probability)
      byRecipe.set(row.recipe_id, entry)
    }
    if (byRecipe.size === 0) return []

    const recipes = await Recipe.query()
      .withScopes((s) => {
        s.active()
        s.withDetails()
      })
      .whereIn('id', [...byRecipe.keys()])
      .orderBy('name')

    return recipes.map((recipe) => ({ recipe, ...byRecipe.get(recipe.id)! }))
  }

  /**
   * Recipes that take this item as an ingredient.
   */
  async consumingRecipes(): Promise<Recipe[]> {
    return Recipe.query()
      .withScopes((s) => {
        s.active()
        s.withDetails()
      })
      .whereHas('inputs', (inputs) => inputs.where('item_id', this.id))
      .orderBy('name')
  }
}
