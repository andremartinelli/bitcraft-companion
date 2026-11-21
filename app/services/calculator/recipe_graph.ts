import db from '@adonisjs/lucid/services/db'
import GameDataImport from '#models/game_data_import'

export interface GraphItem {
  id: number
  name: string
  tier: number
  rarity: string | null
  kind: 'item' | 'cargo'
  removed: boolean
}

export interface GraphRecipe {
  id: number
  name: string
  verb: string
  skillName: string | null
  skillLevel: number | null
  stationName: string | null
  stationTier: number | null
  actionsRequired: number
  hidden: boolean
  inputs: { itemId: number; quantity: number }[]
}

export interface Producer {
  recipeId: number
  /** Expected quantity of the item per craft */
  yield: number
  /** False when the quantity per craft varies (random outputs) */
  deterministic: boolean
}

interface Possibility {
  probability: number
  items: Map<number, number>
}

/**
 * Every active crafting recipe, held in memory for the calculator. Built once
 * per game data import: ~9k recipes and ~20k ingredients, a few MB.
 */
export default class RecipeGraph {
  static #cache?: { key: string; graph: RecipeGraph }

  constructor(
    public items: Map<number, GraphItem>,
    public recipes: Map<number, GraphRecipe>,
    public producers: Map<number, Producer[]>
  ) {}

  /**
   * The graph for the latest finished import. An import made by another
   * process (the ace command while the server runs) changes the key.
   */
  static async current(): Promise<RecipeGraph> {
    const latest = await GameDataImport.query()
      .whereNotNull('finished_at')
      .orderBy('id', 'desc')
      .first()
    const key = latest ? `${latest.id}:${latest.finishedAt?.toISO()}` : 'none'
    if (this.#cache?.key !== key) this.#cache = { key, graph: await this.load() }
    return this.#cache.graph
  }

  static invalidate() {
    this.#cache = undefined
  }

  static async load(): Promise<RecipeGraph> {
    const [itemRows, recipeRows, inputRows, outputRows, listRows] = await Promise.all([
      db
        .from('items')
        .select('id', 'name', 'tier', 'rarity', 'kind', 'item_list_game_id', 'removed_at'),
      db
        .from('recipes as r')
        .leftJoin('skills as s', 's.id', 'r.skill_id')
        .leftJoin('building_types as b', 'b.id', 'r.building_type_id')
        .whereNull('r.removed_at')
        .where('r.kind', 'crafting')
        .select(
          'r.id',
          'r.name',
          'r.verb',
          'r.skill_level',
          'r.building_tier',
          'r.actions_required',
          'r.hidden_without_knowledge',
          's.name as skill_name',
          'b.name as station_name'
        ),
      db
        .from('recipe_inputs as ri')
        .join('recipes as r', 'r.id', 'ri.recipe_id')
        .whereNull('r.removed_at')
        .where('r.kind', 'crafting')
        .orderBy('ri.id')
        .select('ri.recipe_id', 'ri.item_id', 'ri.quantity'),
      db
        .from('recipe_outputs as ro')
        .join('recipes as r', 'r.id', 'ro.recipe_id')
        .whereNull('r.removed_at')
        .where('r.kind', 'crafting')
        .select('ro.recipe_id', 'ro.item_id', 'ro.quantity'),
      db
        .from('item_lists as l')
        .join('item_list_possibilities as p', 'p.item_list_id', 'l.id')
        .leftJoin('item_list_possibility_items as pi', 'pi.possibility_id', 'p.id')
        .whereNull('l.removed_at')
        .select(
          'l.game_id',
          'p.id as possibility_id',
          'p.probability',
          'pi.item_id',
          'pi.quantity'
        ),
    ])

    const items = new Map<number, GraphItem>()
    const listGameIdOf = new Map<number, number>()
    for (const row of itemRows) {
      items.set(row.id, {
        id: row.id,
        name: row.name,
        tier: row.tier,
        rarity: row.rarity,
        kind: row.kind,
        removed: row.removed_at !== null,
      })
      if (row.item_list_game_id) listGameIdOf.set(row.id, row.item_list_game_id)
    }

    const recipes = new Map<number, GraphRecipe>()
    for (const row of recipeRows) {
      recipes.set(row.id, {
        id: row.id,
        name: row.name,
        verb: row.verb,
        skillName: row.skill_name,
        skillLevel: row.skill_level,
        stationName: row.station_name,
        stationTier: row.building_tier,
        actionsRequired: row.actions_required,
        hidden: Boolean(row.hidden_without_knowledge),
        inputs: [],
      })
    }
    for (const row of inputRows) {
      recipes.get(row.recipe_id)?.inputs.push({ itemId: row.item_id, quantity: row.quantity })
    }

    const lists = new Map<number, Map<number, Possibility>>()
    for (const row of listRows) {
      const possibilities = lists.get(row.game_id) ?? new Map<number, Possibility>()
      const possibility = possibilities.get(row.possibility_id) ?? {
        probability: row.probability,
        items: new Map(),
      }
      if (row.item_id !== null) {
        possibility.items.set(row.item_id, (possibility.items.get(row.item_id) ?? 0) + row.quantity)
      }
      possibilities.set(row.possibility_id, possibility)
      lists.set(row.game_id, possibilities)
    }

    // (recipe, item) -> yield; a recipe can reach the same item more than once
    const yields = new Map<string, Producer & { itemId: number }>()
    const addYield = (recipeId: number, itemId: number, amount: number, deterministic: boolean) => {
      const key = `${recipeId}:${itemId}`
      const current = yields.get(key)
      if (current) {
        current.yield += amount
        current.deterministic &&= deterministic
      } else {
        yields.set(key, { recipeId, itemId, yield: amount, deterministic })
      }
    }

    for (const row of outputRows) {
      // The output itself, even when it is a random output ("Pyrelite Axe"
      // that becomes a Common or Uncommon Pyrelite Axe): targeting it means
      // "craft this, whatever rarity comes out".
      addYield(row.recipe_id, row.item_id, row.quantity, true)

      const listGameId = listGameIdOf.get(row.item_id)
      const possibilities = listGameId !== undefined ? lists.get(listGameId) : undefined
      if (!possibilities) continue
      const all = [...possibilities.values()]
      const reachable = new Set(all.flatMap((p) => [...p.items.keys()]))
      for (const itemId of reachable) {
        const amounts = all.map((p) => p.items.get(itemId) ?? 0)
        const expected = all.reduce((sum, p, i) => sum + p.probability * amounts[i], 0)
        const totalProbability = all.reduce((sum, p) => sum + p.probability, 0)
        const deterministic =
          amounts.every((amount) => amount === amounts[0]) && Math.abs(totalProbability - 1) < 1e-6
        addYield(row.recipe_id, itemId, expected * row.quantity, deterministic)
      }
    }

    const producers = new Map<number, Producer[]>()
    for (const { itemId, ...producer } of yields.values()) {
      if (producer.yield <= 0) continue
      const list = producers.get(itemId) ?? []
      list.push(producer)
      producers.set(itemId, list)
    }

    return new RecipeGraph(items, recipes, producers)
  }
}
