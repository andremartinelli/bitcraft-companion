import { gunzipSync, gzipSync } from 'node:zlib'
import type { Prisma } from '@/generated/prisma/client.ts'
import { db } from '@/lib/db'
import { latestFinishedImport } from '@/models/game_data_import'

export interface GraphItem {
  id: number
  name: string
  tier: number
  rarity: string | null
  kind: 'item' | 'cargo'
  /** The game's tag: "Animal", "Trade Good", "Leather Clothing"... */
  tag: string | null
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
  /** Hammer, Mallet...: the tool it takes, if any */
  toolName: string | null
  toolTier: number | null
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
 * Every active crafting recipe, held in memory for the calculator: ~9k
 * recipes and ~20k ingredients. The import builds it and stores it
 * compressed (recipe_graph_snapshots); the app reads that snapshot once per
 * instance and import (getRecipeGraph).
 */
export class RecipeGraph {
  constructor(
    public items: Map<number, GraphItem>,
    public recipes: Map<number, GraphRecipe>,
    public producers: Map<number, Producer[]>,
    /** The skill that gathers or hunts each item (Forestry, Mining, Hunting...), when one does */
    public gatherers: Map<number, string> = new Map(),
    /**
     * Items the world gives as they are, not only through a random list:
     * sand dug from the ground, braxite from a vein, logs from a tree.
     */
    public gatheredDirectly: Set<number> = new Set(),
    /** Buildings (construction recipes): what each takes; they make no item */
    public constructions: Map<number, GraphRecipe> = new Map()
  ) {}

  /**
   * An animal body comes only from hunting. One no hunt leaves is a leftover
   * from older versions: hunting a Female Cervus leaves a "Cervus", and the
   * "Female Cervus" body is never found any more.
   */
  isLostAnimal(itemId: number) {
    const item = this.items.get(itemId)
    return item?.tag === 'Animal' && !this.gatherers.has(itemId) && !this.producers.has(itemId)
  }
}

/** What the graph is built from: the rows of the game data tables */
export interface GraphRows {
  items: {
    id: number
    name: string
    tier: number
    rarity: string | null
    kind: 'item' | 'cargo'
    tag: string | null
    item_list_game_id: number | null
    removed: boolean
  }[]
  recipes: {
    id: number
    kind: 'crafting' | 'construction'
    name: string
    verb: string
    skill_level: number | null
    building_tier: number | null
    tool_tier: number | null
    actions_required: number
    hidden_without_knowledge: boolean
    skill_name: string | null
    station_name: string | null
    tool_name: string | null
  }[]
  inputs: { recipe_id: number; item_id: number; quantity: number }[]
  outputs: { recipe_id: number; item_id: number; quantity: number }[]
  lists: {
    game_id: number
    possibility_id: number
    probability: number
    item_id: number | null
    quantity: number | null
  }[]
  gathers: { item_id: number; skill_name: string }[]
}

type Queryable = Pick<Prisma.TransactionClient, '$queryRaw'>

/** The rows of the active game data the graph needs (removed items too: plans may name them) */
export async function loadGraphRows(client: Queryable): Promise<GraphRows> {
  const [items, recipes, inputs, outputs, lists, gathers] = await Promise.all([
    client.$queryRaw<GraphRows['items']>`
      SELECT id, name, tier, rarity, kind::text AS kind, tag, item_list_game_id,
             removed_at IS NOT NULL AS removed
      FROM items ORDER BY id`,
    client.$queryRaw<GraphRows['recipes']>`
      SELECT r.id, r.kind::text AS kind, r.name, r.verb, r.skill_level, r.building_tier,
             r.tool_tier, r.actions_required, r.hidden_without_knowledge,
             s.name AS skill_name, b.name AS station_name, t.name AS tool_name
      FROM recipes r
      LEFT JOIN skills s ON s.id = r.skill_id
      LEFT JOIN building_types b ON b.id = r.building_type_id
      LEFT JOIN tool_types t ON t.id = r.tool_type_id
      WHERE r.removed_at IS NULL
      ORDER BY r.id`,
    client.$queryRaw<GraphRows['inputs']>`
      SELECT ri.recipe_id, ri.item_id, ri.quantity
      FROM recipe_inputs ri JOIN recipes r ON r.id = ri.recipe_id
      WHERE r.removed_at IS NULL
      ORDER BY ri.id`,
    client.$queryRaw<GraphRows['outputs']>`
      SELECT ro.recipe_id, ro.item_id, ro.quantity
      FROM recipe_outputs ro JOIN recipes r ON r.id = ro.recipe_id
      WHERE r.removed_at IS NULL AND r.kind = 'crafting'
      ORDER BY ro.id`,
    client.$queryRaw<GraphRows['lists']>`
      SELECT l.game_id, p.id AS possibility_id, p.probability, pi.item_id, pi.quantity
      FROM item_lists l
      JOIN item_list_possibilities p ON p.item_list_id = l.id
      LEFT JOIN item_list_possibility_items pi ON pi.possibility_id = p.id
      WHERE l.removed_at IS NULL
      ORDER BY p.id, pi.id`,
    client.$queryRaw<GraphRows['gathers']>`
      SELECT eo.item_id, s.name AS skill_name
      FROM extraction_recipe_outputs eo
      JOIN extraction_recipes e ON e.id = eo.extraction_recipe_id
      JOIN skills s ON s.id = e.skill_id
      WHERE e.removed_at IS NULL
      ORDER BY eo.id`,
  ])
  return { items, recipes, inputs, outputs, lists, gathers }
}

export function buildRecipeGraph(rows: GraphRows): RecipeGraph {
  const items = new Map<number, GraphItem>()
  const listGameIdOf = new Map<number, number>()
  for (const row of rows.items) {
    items.set(row.id, {
      id: row.id,
      name: row.name,
      tier: row.tier,
      rarity: row.rarity,
      kind: row.kind,
      tag: row.tag,
      removed: row.removed,
    })
    if (row.item_list_game_id) listGameIdOf.set(row.id, row.item_list_game_id)
  }

  const recipes = new Map<number, GraphRecipe>()
  const constructions = new Map<number, GraphRecipe>()
  for (const row of rows.recipes) {
    const recipe: GraphRecipe = {
      id: row.id,
      name: row.name,
      verb: row.verb,
      skillName: row.skill_name,
      skillLevel: row.skill_level,
      stationName: row.station_name,
      stationTier: row.building_tier,
      toolName: row.tool_name,
      toolTier: row.tool_tier,
      actionsRequired: row.actions_required,
      hidden: Boolean(row.hidden_without_knowledge),
      inputs: [],
    }
    ;(row.kind === 'construction' ? constructions : recipes).set(row.id, recipe)
  }
  for (const row of rows.inputs) {
    const recipe = recipes.get(row.recipe_id) ?? constructions.get(row.recipe_id)
    recipe?.inputs.push({ itemId: row.item_id, quantity: row.quantity })
  }

  const lists = new Map<number, Map<number, Possibility>>()
  for (const row of rows.lists) {
    const possibilities = lists.get(row.game_id) ?? new Map<number, Possibility>()
    const possibility = possibilities.get(row.possibility_id) ?? {
      probability: row.probability,
      items: new Map(),
    }
    if (row.item_id !== null) {
      possibility.items.set(
        row.item_id,
        (possibility.items.get(row.item_id) ?? 0) + (row.quantity ?? 0)
      )
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

  for (const row of rows.outputs) {
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

  const gathered = gatherersOf(rows.gathers, listGameIdOf, lists)
  return new RecipeGraph(items, recipes, producers, gathered.skills, gathered.direct, constructions)
}

/**
 * The skill that gathers each item. A gathering often gives a random-output
 * list ("T1 Bark Output"): every item the list can give counts. When more
 * than one skill gathers an item, the one with more ways to do it wins.
 * `direct`: the items a gathering gives as they are, not through a list.
 */
function gatherersOf(
  rows: GraphRows['gathers'],
  listGameIdOf: Map<number, number>,
  lists: Map<number, Map<number, Possibility>>
) {
  const counts = new Map<number, Map<string, number>>()
  const direct = new Set<number>()
  const add = (itemId: number, skill: string) => {
    const bySkill = counts.get(itemId) ?? new Map<string, number>()
    bySkill.set(skill, (bySkill.get(skill) ?? 0) + 1)
    counts.set(itemId, bySkill)
  }
  for (const row of rows) {
    add(row.item_id, row.skill_name)
    const listGameId = listGameIdOf.get(row.item_id)
    if (listGameId === undefined) {
      direct.add(row.item_id)
      continue
    }
    const possibilities = lists.get(listGameId)
    const reachable = new Set(
      [...(possibilities?.values() ?? [])].flatMap((p) => [...p.items.keys()])
    )
    for (const itemId of reachable) add(itemId, row.skill_name)
  }
  const skills = new Map(
    [...counts].map(([itemId, bySkill]) => [
      itemId,
      [...bySkill].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
    ])
  )
  return { skills, direct }
}

/* ------------------------------------------------------------------ snapshot */

const SNAPSHOT_VERSION = 1

type SnapshotItem = [number, string, number, string | null, 'item' | 'cargo', string | null, 0 | 1]
type SnapshotRecipe = [
  number,
  string,
  string,
  string | null,
  number | null,
  string | null,
  number | null,
  string | null,
  number | null,
  number,
  0 | 1,
  /** Inputs as pairs: item id, quantity, item id, quantity... */
  number[],
]

interface Snapshot {
  version: number
  items: SnapshotItem[]
  recipes: SnapshotRecipe[]
  constructions: SnapshotRecipe[]
  producers: [number, [number, number, 0 | 1][]][]
  gatherers: [number, string][]
  direct: number[]
}

const packRecipe = (r: GraphRecipe): SnapshotRecipe => [
  r.id,
  r.name,
  r.verb,
  r.skillName,
  r.skillLevel,
  r.stationName,
  r.stationTier,
  r.toolName,
  r.toolTier,
  r.actionsRequired,
  r.hidden ? 1 : 0,
  r.inputs.flatMap((input) => [input.itemId, input.quantity]),
]

const unpackRecipe = ([
  id,
  name,
  verb,
  skillName,
  skillLevel,
  stationName,
  stationTier,
  toolName,
  toolTier,
  actionsRequired,
  hidden,
  pairs,
]: SnapshotRecipe): GraphRecipe => {
  const inputs: GraphRecipe['inputs'] = []
  for (let i = 0; i < pairs.length; i += 2)
    inputs.push({ itemId: pairs[i], quantity: pairs[i + 1] })
  return {
    id,
    name,
    verb,
    skillName,
    skillLevel,
    stationName,
    stationTier,
    toolName,
    toolTier,
    actionsRequired,
    hidden: hidden === 1,
    inputs,
  }
}

/** The graph as compact JSON (arrays, not objects), gzipped: ~0.5 MB */
export function serializeGraph(graph: RecipeGraph): Uint8Array<ArrayBuffer> {
  const snapshot: Snapshot = {
    version: SNAPSHOT_VERSION,
    items: [...graph.items.values()].map((i) => [
      i.id,
      i.name,
      i.tier,
      i.rarity,
      i.kind,
      i.tag,
      i.removed ? 1 : 0,
    ]),
    recipes: [...graph.recipes.values()].map(packRecipe),
    constructions: [...graph.constructions.values()].map(packRecipe),
    producers: [...graph.producers].map(([itemId, list]) => [
      itemId,
      list.map((p) => [p.recipeId, p.yield, p.deterministic ? 1 : 0]),
    ]),
    gatherers: [...graph.gatherers],
    direct: [...graph.gatheredDirectly],
  }
  return new Uint8Array(gzipSync(JSON.stringify(snapshot)))
}

export function deserializeGraph(data: Uint8Array): RecipeGraph {
  const snapshot = JSON.parse(gunzipSync(data).toString('utf8')) as Snapshot
  if (snapshot.version !== SNAPSHOT_VERSION) {
    throw new Error(
      `Snapshot do grafo na versão ${snapshot.version}; esperada ${SNAPSHOT_VERSION}.`
    )
  }
  const byId = <T extends { id: number }>(list: T[]) => new Map(list.map((x) => [x.id, x]))
  return new RecipeGraph(
    byId(
      snapshot.items.map(([id, name, tier, rarity, kind, tag, removed]) => ({
        id,
        name,
        tier,
        rarity,
        kind,
        tag,
        removed: removed === 1,
      }))
    ),
    byId(snapshot.recipes.map(unpackRecipe)),
    new Map(
      snapshot.producers.map(([itemId, list]) => [
        itemId,
        list.map(([recipeId, amount, deterministic]) => ({
          recipeId,
          yield: amount,
          deterministic: deterministic === 1,
        })),
      ])
    ),
    new Map(snapshot.gatherers),
    new Set(snapshot.direct),
    byId(snapshot.constructions.map(unpackRecipe))
  )
}

/* --------------------------------------------------------------------- cache */

const globalForGraph = globalThis as unknown as {
  recipeGraph?: { key: string; graph: Promise<RecipeGraph> }
}

/**
 * The graph of the latest finished import, kept per instance until another
 * import finishes. Read from the import's snapshot; built from the tables
 * only when there is none.
 */
export function getRecipeGraph(): Promise<RecipeGraph> {
  return latestFinishedImport().then((latest) => {
    const key = latest ? `${latest.id}:${latest.finishedAt?.toISOString()}` : 'none'
    if (globalForGraph.recipeGraph?.key !== key) {
      const graph = loadGraph(latest?.id ?? null)
      globalForGraph.recipeGraph = { key, graph }
      // A failed load is not kept: the next request tries again
      graph.catch(() => {
        if (globalForGraph.recipeGraph?.graph === graph) globalForGraph.recipeGraph = undefined
      })
    }
    return globalForGraph.recipeGraph!.graph
  })
}

async function loadGraph(importId: number | null) {
  if (importId !== null) {
    const snapshot = await db.recipeGraphSnapshot.findUnique({ where: { importId } })
    if (snapshot) return deserializeGraph(snapshot.data)
    console.warn(`Importação ${importId} sem snapshot do grafo: montando pelas tabelas.`)
  }
  return buildRecipeGraph(await loadGraphRows(db))
}
