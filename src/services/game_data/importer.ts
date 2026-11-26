import { Prisma } from '@/generated/prisma/client.ts'
import { db, type Db } from '@/lib/db'
import { buildRecipeGraph, loadGraphRows, serializeGraph } from '@/services/calculator/recipe_graph'
import type { GameDataSource, RawRow } from '@/services/game_data/source'
import {
  itemKey,
  toClaimTechRows,
  toConstructionRecipeRows,
  toCraftingRecipeRows,
  toExtractionRecipeRows,
  toHuntingRows,
  toTravelerTaskRows,
  toItemListRows,
  toItemRows,
  type ClaimTechRow,
  type ExtractionRecipeRow,
  type TravelerTaskRow,
  type ItemKey,
  type ItemListRow,
  type ItemRow,
  type RecipeRow,
  type StackRow,
} from '@/services/game_data/transform'

export interface ImportSummary {
  importId: number
  counts: Record<string, number>
  added: { items: number; itemLists: number; recipes: number }
  removed: { items: number; itemLists: number; recipes: number }
  renamed: { kind: string; gameId: number; from: string; to: string }[]
  /** References in the game data to things the game data does not define */
  skipped: { missingItems: number; unknownLookups: number }
}

type Tx = Prisma.TransactionClient

interface Lookups {
  skills: Set<number>
  toolTypes: Set<number>
  buildingTypes: Set<number>
}

/**
 * Every row of a table goes in one statement, as a JSON array read by
 * jsonb_to_recordset: one round trip per table, which matters across the
 * network to Neon (the old importer made one per random-output possibility).
 */
const rowsJson = (rows: unknown[]) => JSON.stringify(rows)

/**
 * Imports the static game data in one transaction. Re-running it with the
 * same data changes nothing. Rows that left the game get `removed_at`
 * instead of being deleted, because user data points at them. At the end it
 * stores the calculator's recipe graph for this import.
 */
export default class GameDataImporter {
  constructor(
    private onProgress: (message: string) => void = () => {},
    private client: Db = db
  ) {}

  async run(source: GameDataSource): Promise<ImportSummary> {
    const info = await source.describe()
    this.onProgress(
      `Lendo dados (${info.source}${info.commitSha ? ` @ ${info.commitSha.slice(0, 7)}` : ''})`
    )

    const tables = {
      items: await source.read('item_desc'),
      cargo: await source.read('cargo_desc'),
      lists: await source.read('item_list_desc'),
      crafting: await source.read('crafting_recipe_desc'),
      construction: await source.read('construction_recipe_desc'),
      buildings: await source.read('building_desc'),
      buildingTypes: await source.read('building_type_desc'),
      skills: await source.read('skill_desc'),
      toolTypes: await source.read('tool_type_desc'),
      claimTechs: await source.read('claim_tech_desc'),
      extraction: await source.read('extraction_recipe_desc'),
      enemies: await source.read('enemy_desc'),
      travelerTasks: await source.read('traveler_task_desc'),
      npcs: await source.read('npc_desc'),
    }

    // Transform everything first: a format error must stop the import before any write.
    const itemRows = toItemRows(tables.items, tables.cargo)
    const names = new Map(itemRows.map((row) => [itemKey(row.kind, row.gameId), row.name]))
    const buildingNames = new Map<number, string>(
      tables.buildings.map((b: RawRow) => [b.id, b.name])
    )
    const listRows = toItemListRows(tables.lists)
    const recipeRows = [
      ...toCraftingRecipeRows(tables.crafting, names),
      ...toConstructionRecipeRows(tables.construction, buildingNames),
    ]
    const claimTechRows = toClaimTechRows(tables.claimTechs)
    const extractionRows = [
      ...toExtractionRecipeRows(tables.extraction),
      ...toHuntingRows(tables.enemies),
    ]
    const travelerTaskRows = toTravelerTaskRows(tables.travelerTasks, tables.npcs)

    return this.client.$transaction(
      async (tx) => {
        const now = new Date()
        const record = await tx.gameDataImport.create({
          data: { source: info.source, commitSha: info.commitSha, sourceDate: info.date },
        })
        const summary: ImportSummary = {
          importId: record.id,
          counts: {},
          added: { items: 0, itemLists: 0, recipes: 0 },
          removed: { items: 0, itemLists: 0, recipes: 0 },
          renamed: [],
          skipped: { missingItems: 0, unknownLookups: 0 },
        }
        const stamp = { importId: record.id, now }

        this.onProgress('Tabelas de apoio (skills, ferramentas, estações)')
        const lookups: Lookups = {
          skills: await upsertLookup(tx, 'skills', tables.skills),
          toolTypes: await upsertLookup(tx, 'tool_types', tables.toolTypes),
          buildingTypes: await upsertLookup(tx, 'building_types', tables.buildingTypes),
        }

        this.onProgress(`Itens (${itemRows.length})`)
        const itemIds = await upsertItems(tx, itemRows, stamp, summary)

        this.onProgress(`Saídas aleatórias (${listRows.length})`)
        await upsertItemLists(tx, listRows, itemIds, stamp, summary)

        this.onProgress(`Receitas (${recipeRows.length})`)
        await upsertRecipes(tx, recipeRows, itemIds, lookups, stamp, summary)

        this.onProgress(`Pesquisas do assentamento (${claimTechRows.length})`)
        await upsertClaimTechs(tx, claimTechRows, itemIds, stamp, summary)

        this.onProgress(`Coletas e caça (${extractionRows.length})`)
        await upsertExtractionRecipes(tx, extractionRows, itemIds, lookups, stamp, summary)

        this.onProgress(`Tasks dos viajantes (${travelerTaskRows.length})`)
        await upsertTravelerTasks(tx, travelerTaskRows, itemIds, stamp, summary)

        this.onProgress('Marcando o que saiu do jogo')
        summary.removed.items = await markRemoved(tx, 'items', stamp)
        summary.removed.itemLists = await markRemoved(tx, 'item_lists', stamp)
        summary.removed.recipes = await markRemoved(tx, 'recipes', stamp)
        await markRemoved(tx, 'claim_techs', stamp)
        await markRemoved(tx, 'extraction_recipes', stamp)
        await markRemoved(tx, 'traveler_tasks', stamp)

        this.onProgress('Grafo de receitas da calculadora')
        const graph = buildRecipeGraph(await loadGraphRows(tx))
        await tx.recipeGraphSnapshot.create({
          data: { importId: record.id, data: serializeGraph(graph) },
        })
        // Only the latest import's graph is ever read
        await tx.recipeGraphSnapshot.deleteMany({ where: { importId: { not: record.id } } })

        summary.counts = {
          items: itemRows.filter((row) => row.kind === 'item').length,
          cargo: itemRows.filter((row) => row.kind === 'cargo').length,
          itemLists: listRows.length,
          craftingRecipes: recipeRows.filter((row) => row.kind === 'crafting').length,
          constructionRecipes: recipeRows.filter((row) => row.kind === 'construction').length,
          claimTechs: claimTechRows.length,
          extractionRecipes: extractionRows.filter((row) => row.source === 'resource').length,
          hunting: extractionRows.filter((row) => row.source === 'enemy').length,
          travelerTasks: travelerTaskRows.length,
        }
        // finished_at last: the app switches to this import (and its graph) only now
        await tx.gameDataImport.update({
          where: { id: record.id },
          data: { counts: summary.counts, renamed: summary.renamed, finishedAt: now },
        })
        return summary
      },
      // Across the network to Neon, from the PC: give it time
      { timeout: 10 * 60_000, maxWait: 60_000 }
    )
  }
}

interface Stamp {
  importId: number
  now: Date
}

async function upsertLookup(tx: Tx, table: string, rows: RawRow[]) {
  const values = rows.map((row) => ({ id: row.id, name: row.name }))
  await tx.$executeRaw`
    INSERT INTO ${Prisma.raw(table)} (id, name)
    SELECT r.id, r.name FROM jsonb_to_recordset(${rowsJson(values)}::jsonb) AS r(id int, name text)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`
  return new Set<number>(values.map((v) => v.id))
}

async function upsertItems(tx: Tx, rows: ItemRow[], stamp: Stamp, summary: ImportSummary) {
  const existing = await tx.item.findMany({ select: { kind: true, gameId: true, name: true } })
  const before = new Map<ItemKey, string>(existing.map((r) => [itemKey(r.kind, r.gameId), r.name]))
  for (const row of rows) {
    const previous = before.get(itemKey(row.kind, row.gameId))
    if (previous === undefined) summary.added.items++
    else if (previous !== row.name) {
      summary.renamed.push({ kind: row.kind, gameId: row.gameId, from: previous, to: row.name })
    }
  }

  const values = rows.map((row) => ({
    kind: row.kind,
    game_id: row.gameId,
    name: row.name,
    description: row.description,
    tier: row.tier,
    tag: row.tag,
    rarity: row.rarity,
    icon_asset_name: row.iconAssetName,
    item_list_game_id: row.itemListGameId,
  }))
  await tx.$executeRaw`
    INSERT INTO items (kind, game_id, name, description, tier, tag, rarity, icon_asset_name,
                       item_list_game_id, removed_at, last_import_id, created_at, updated_at)
    SELECT r.kind::item_kind, r.game_id, r.name, r.description, r.tier, r.tag, r.rarity,
           r.icon_asset_name, r.item_list_game_id, NULL, ${stamp.importId}, ${stamp.now}, ${stamp.now}
    FROM jsonb_to_recordset(${rowsJson(values)}::jsonb) AS r(
      kind text, game_id int, name text, description text, tier int, tag text, rarity text,
      icon_asset_name text, item_list_game_id int)
    ON CONFLICT (kind, game_id) DO UPDATE SET
      name = EXCLUDED.name, description = EXCLUDED.description, tier = EXCLUDED.tier,
      tag = EXCLUDED.tag, rarity = EXCLUDED.rarity, icon_asset_name = EXCLUDED.icon_asset_name,
      item_list_game_id = EXCLUDED.item_list_game_id,
      removed_at = NULL, last_import_id = EXCLUDED.last_import_id, updated_at = EXCLUDED.updated_at`

  const ids = await tx.item.findMany({ select: { id: true, kind: true, gameId: true } })
  return new Map<ItemKey, number>(ids.map((r) => [itemKey(r.kind, r.gameId), r.id]))
}

function resolveStacks(stacks: StackRow[], itemIds: Map<ItemKey, number>, summary: ImportSummary) {
  const resolved: { itemId: number; quantity: number }[] = []
  for (const stack of stacks) {
    const itemId = itemIds.get(stack.key)
    if (itemId === undefined) summary.skipped.missingItems++
    else resolved.push({ itemId, quantity: stack.quantity })
  }
  return resolved
}

async function upsertItemLists(
  tx: Tx,
  rows: ItemListRow[],
  itemIds: Map<ItemKey, number>,
  stamp: Stamp,
  summary: ImportSummary
) {
  const existing = new Set(
    (await tx.itemList.findMany({ select: { gameId: true } })).map((r) => r.gameId)
  )
  summary.added.itemLists = rows.filter((row) => !existing.has(row.gameId)).length

  const values = rows.map((row) => ({ game_id: row.gameId, name: row.name }))
  await tx.$executeRaw`
    INSERT INTO item_lists (game_id, name, removed_at, last_import_id, created_at, updated_at)
    SELECT r.game_id, r.name, NULL, ${stamp.importId}, ${stamp.now}, ${stamp.now}
    FROM jsonb_to_recordset(${rowsJson(values)}::jsonb) AS r(game_id int, name text)
    ON CONFLICT (game_id) DO UPDATE SET
      name = EXCLUDED.name, removed_at = NULL, last_import_id = EXCLUDED.last_import_id,
      updated_at = EXCLUDED.updated_at`

  // Each item points at its list by our id too (items.item_list_id)
  await tx.$executeRaw`
    UPDATE items SET item_list_id = l.id
    FROM item_lists l
    WHERE l.game_id = items.item_list_game_id AND items.item_list_id IS DISTINCT FROM l.id`
  await tx.$executeRaw`
    UPDATE items SET item_list_id = NULL
    WHERE item_list_id IS NOT NULL
      AND (item_list_game_id IS NULL
           OR NOT EXISTS (SELECT 1 FROM item_lists l WHERE l.game_id = items.item_list_game_id))`

  const listIds = new Map(
    (await tx.itemList.findMany({ select: { id: true, gameId: true } })).map((r) => [
      r.gameId,
      r.id,
    ])
  )

  // The possibilities of this import's lists are replaced (their items go with them)
  await tx.$executeRaw`
    DELETE FROM item_list_possibilities
    WHERE item_list_id IN (SELECT id FROM item_lists WHERE last_import_id = ${stamp.importId})`

  const possibilities = rows.flatMap((row) =>
    row.possibilities.map((possibility, position) => ({
      item_list_id: listIds.get(row.gameId)!,
      position,
      probability: possibility.probability,
    }))
  )
  await tx.$executeRaw`
    INSERT INTO item_list_possibilities (item_list_id, position, probability)
    SELECT r.item_list_id, r.position, r.probability
    FROM jsonb_to_recordset(${rowsJson(possibilities)}::jsonb)
      AS r(item_list_id int, position int, probability double precision)`

  const inserted = await tx.$queryRaw<{ id: number; item_list_id: number; position: number }[]>`
    SELECT p.id, p.item_list_id, p.position
    FROM item_list_possibilities p JOIN item_lists l ON l.id = p.item_list_id
    WHERE l.last_import_id = ${stamp.importId}`
  const possibilityIds = new Map(inserted.map((p) => [`${p.item_list_id}:${p.position}`, p.id]))

  const items = rows.flatMap((row) =>
    row.possibilities.flatMap((possibility, position) => {
      const possibilityId = possibilityIds.get(`${listIds.get(row.gameId)}:${position}`)!
      return resolveStacks(possibility.items, itemIds, summary).map((stack) => ({
        possibility_id: possibilityId,
        item_id: stack.itemId,
        quantity: stack.quantity,
      }))
    })
  )
  await tx.$executeRaw`
    INSERT INTO item_list_possibility_items (possibility_id, item_id, quantity)
    SELECT r.possibility_id, r.item_id, r.quantity
    FROM jsonb_to_recordset(${rowsJson(items)}::jsonb)
      AS r(possibility_id int, item_id int, quantity int)`
}

/** A lookup id the game data does not define is dropped (and counted), never stored */
function knownIn(summary: ImportSummary) {
  return (set: Set<number>, id: number | null) => {
    if (id === null) return null
    if (set.has(id)) return id
    summary.skipped.unknownLookups++
    return null
  }
}

/** Ingredients and products: one statement each, for the rows of this import */
async function insertStacks(tx: Tx, table: string, column: string, rows: object[]) {
  await tx.$executeRaw`
    INSERT INTO ${Prisma.raw(table)} (${Prisma.raw(column)}, item_id, quantity)
    SELECT r.owner_id, r.item_id, r.quantity
    FROM jsonb_to_recordset(${rowsJson(rows)}::jsonb) AS r(owner_id int, item_id int, quantity int)`
}

async function upsertRecipes(
  tx: Tx,
  rows: RecipeRow[],
  itemIds: Map<ItemKey, number>,
  lookups: Lookups,
  stamp: Stamp,
  summary: ImportSummary
) {
  const existing = new Set(
    (await tx.recipe.findMany({ select: { kind: true, gameId: true } })).map(
      (r) => `${r.kind}:${r.gameId}`
    )
  )
  summary.added.recipes = rows.filter((row) => !existing.has(`${row.kind}:${row.gameId}`)).length

  const known = knownIn(summary)
  const values = rows.map((row) => ({
    kind: row.kind,
    game_id: row.gameId,
    name: row.name,
    verb: row.verb,
    actions_required: row.actionsRequired,
    time_per_action: row.timePerAction,
    stamina_per_action: row.staminaPerAction,
    skill_id: known(lookups.skills, row.skillId),
    skill_level: row.skillLevel,
    tool_type_id: known(lookups.toolTypes, row.toolTypeId),
    tool_tier: row.toolTier,
    building_type_id: known(lookups.buildingTypes, row.buildingTypeId),
    building_tier: row.buildingTier,
    is_passive: row.isPassive,
    hidden_without_knowledge: row.hiddenWithoutKnowledge,
    shards: row.shards,
    paving_tier: row.pavingTier,
  }))
  await tx.$executeRaw`
    INSERT INTO recipes (kind, game_id, name, verb, actions_required, time_per_action,
                         stamina_per_action, skill_id, skill_level, tool_type_id, tool_tier,
                         building_type_id, building_tier, is_passive, hidden_without_knowledge,
                         shards, paving_tier, removed_at, last_import_id, created_at, updated_at)
    SELECT r.kind::recipe_kind, r.game_id, r.name, r.verb, r.actions_required, r.time_per_action,
           r.stamina_per_action, r.skill_id, r.skill_level, r.tool_type_id, r.tool_tier,
           r.building_type_id, r.building_tier, r.is_passive, r.hidden_without_knowledge,
           r.shards, r.paving_tier, NULL, ${stamp.importId}, ${stamp.now}, ${stamp.now}
    FROM jsonb_to_recordset(${rowsJson(values)}::jsonb) AS r(
      kind text, game_id int, name text, verb text, actions_required int,
      time_per_action double precision, stamina_per_action double precision, skill_id int,
      skill_level int, tool_type_id int, tool_tier int, building_type_id int, building_tier int,
      is_passive boolean, hidden_without_knowledge boolean, shards int, paving_tier int)
    ON CONFLICT (kind, game_id) DO UPDATE SET
      name = EXCLUDED.name, verb = EXCLUDED.verb, actions_required = EXCLUDED.actions_required,
      time_per_action = EXCLUDED.time_per_action, stamina_per_action = EXCLUDED.stamina_per_action,
      skill_id = EXCLUDED.skill_id, skill_level = EXCLUDED.skill_level,
      tool_type_id = EXCLUDED.tool_type_id, tool_tier = EXCLUDED.tool_tier,
      building_type_id = EXCLUDED.building_type_id, building_tier = EXCLUDED.building_tier,
      is_passive = EXCLUDED.is_passive, hidden_without_knowledge = EXCLUDED.hidden_without_knowledge,
      shards = EXCLUDED.shards, paving_tier = EXCLUDED.paving_tier, removed_at = NULL,
      last_import_id = EXCLUDED.last_import_id, updated_at = EXCLUDED.updated_at`

  const recipeIds = new Map(
    (await tx.recipe.findMany({ select: { id: true, kind: true, gameId: true } })).map((r) => [
      `${r.kind}:${r.gameId}`,
      r.id,
    ])
  )
  await tx.$executeRaw`
    DELETE FROM recipe_inputs
    WHERE recipe_id IN (SELECT id FROM recipes WHERE last_import_id = ${stamp.importId})`
  await tx.$executeRaw`
    DELETE FROM recipe_outputs
    WHERE recipe_id IN (SELECT id FROM recipes WHERE last_import_id = ${stamp.importId})`

  const inputs: object[] = []
  const outputs: object[] = []
  for (const row of rows) {
    const ownerId = recipeIds.get(`${row.kind}:${row.gameId}`)!
    for (const s of resolveStacks(row.inputs, itemIds, summary)) {
      inputs.push({ owner_id: ownerId, item_id: s.itemId, quantity: s.quantity })
    }
    for (const s of resolveStacks(row.outputs, itemIds, summary)) {
      outputs.push({ owner_id: ownerId, item_id: s.itemId, quantity: s.quantity })
    }
  }
  await insertStacks(tx, 'recipe_inputs', 'recipe_id', inputs)
  await insertStacks(tx, 'recipe_outputs', 'recipe_id', outputs)
}

async function upsertClaimTechs(
  tx: Tx,
  rows: ClaimTechRow[],
  itemIds: Map<ItemKey, number>,
  stamp: Stamp,
  summary: ImportSummary
) {
  const values = rows.map((row) => ({
    game_id: row.gameId,
    name: row.name,
    description: row.description,
    tier: row.tier,
    tech_type: row.techType,
    supplies_cost: row.suppliesCost,
    hidden: row.hidden,
  }))
  await tx.$executeRaw`
    INSERT INTO claim_techs (game_id, name, description, tier, tech_type, supplies_cost, hidden,
                             removed_at, last_import_id, created_at, updated_at)
    SELECT r.game_id, r.name, r.description, r.tier, r.tech_type, r.supplies_cost, r.hidden,
           NULL, ${stamp.importId}, ${stamp.now}, ${stamp.now}
    FROM jsonb_to_recordset(${rowsJson(values)}::jsonb) AS r(
      game_id int, name text, description text, tier int, tech_type text, supplies_cost int,
      hidden boolean)
    ON CONFLICT (game_id) DO UPDATE SET
      name = EXCLUDED.name, description = EXCLUDED.description, tier = EXCLUDED.tier,
      tech_type = EXCLUDED.tech_type, supplies_cost = EXCLUDED.supplies_cost,
      hidden = EXCLUDED.hidden, removed_at = NULL, last_import_id = EXCLUDED.last_import_id,
      updated_at = EXCLUDED.updated_at`

  const techIds = new Map(
    (await tx.claimTech.findMany({ select: { id: true, gameId: true } })).map((r) => [
      r.gameId,
      r.id,
    ])
  )
  await tx.$executeRaw`
    DELETE FROM claim_tech_inputs
    WHERE claim_tech_id IN (SELECT id FROM claim_techs WHERE last_import_id = ${stamp.importId})`

  const inputs: object[] = []
  for (const row of rows) {
    const ownerId = techIds.get(row.gameId)!
    for (const s of resolveStacks(row.inputs, itemIds, summary)) {
      inputs.push({ owner_id: ownerId, item_id: s.itemId, quantity: s.quantity })
    }
  }
  await insertStacks(tx, 'claim_tech_inputs', 'claim_tech_id', inputs)
}

async function upsertTravelerTasks(
  tx: Tx,
  rows: TravelerTaskRow[],
  itemIds: Map<ItemKey, number>,
  stamp: Stamp,
  summary: ImportSummary
) {
  const values = rows.map((row) => ({
    game_id: row.gameId,
    traveler: row.traveler,
    skill_id: row.skillId,
    min_level: row.minLevel,
    tier: row.tier,
    description: row.description,
  }))
  await tx.$executeRaw`
    INSERT INTO traveler_tasks (game_id, traveler, skill_id, min_level, tier, description,
                                removed_at, last_import_id, created_at, updated_at)
    SELECT r.game_id, r.traveler, r.skill_id, r.min_level, r.tier, r.description,
           NULL, ${stamp.importId}, ${stamp.now}, ${stamp.now}
    FROM jsonb_to_recordset(${rowsJson(values)}::jsonb) AS r(
      game_id int, traveler text, skill_id int, min_level int, tier int, description text)
    ON CONFLICT (game_id) DO UPDATE SET
      traveler = EXCLUDED.traveler, skill_id = EXCLUDED.skill_id,
      min_level = EXCLUDED.min_level, tier = EXCLUDED.tier, description = EXCLUDED.description,
      removed_at = NULL, last_import_id = EXCLUDED.last_import_id, updated_at = EXCLUDED.updated_at`

  const taskIds = new Map(
    (await tx.travelerTask.findMany({ select: { id: true, gameId: true } })).map((r) => [
      r.gameId,
      r.id,
    ])
  )
  await tx.$executeRaw`
    DELETE FROM traveler_task_inputs
    WHERE traveler_task_id IN (SELECT id FROM traveler_tasks WHERE last_import_id = ${stamp.importId})`

  const inputs: object[] = []
  for (const row of rows) {
    const ownerId = taskIds.get(row.gameId)!
    for (const s of resolveStacks(row.inputs, itemIds, summary)) {
      inputs.push({ owner_id: ownerId, item_id: s.itemId, quantity: s.quantity })
    }
  }
  await insertStacks(tx, 'traveler_task_inputs', 'traveler_task_id', inputs)
}

async function upsertExtractionRecipes(
  tx: Tx,
  rows: ExtractionRecipeRow[],
  itemIds: Map<ItemKey, number>,
  lookups: Lookups,
  stamp: Stamp,
  summary: ImportSummary
) {
  const known = knownIn(summary)
  const values = rows.map((row) => ({
    source: row.source,
    game_id: row.gameId,
    verb: row.verb,
    skill_id: known(lookups.skills, row.skillId),
    skill_level: row.skillLevel,
    tool_type_id: known(lookups.toolTypes, row.toolTypeId),
    tool_tier: row.toolTier,
  }))
  await tx.$executeRaw`
    INSERT INTO extraction_recipes (source, game_id, verb, skill_id, skill_level, tool_type_id,
                                    tool_tier, removed_at, last_import_id, created_at, updated_at)
    SELECT r.source::extraction_source, r.game_id, r.verb, r.skill_id, r.skill_level,
           r.tool_type_id, r.tool_tier, NULL, ${stamp.importId}, ${stamp.now}, ${stamp.now}
    FROM jsonb_to_recordset(${rowsJson(values)}::jsonb) AS r(
      source text, game_id int, verb text, skill_id int, skill_level int, tool_type_id int,
      tool_tier int)
    ON CONFLICT (source, game_id) DO UPDATE SET
      verb = EXCLUDED.verb, skill_id = EXCLUDED.skill_id, skill_level = EXCLUDED.skill_level,
      tool_type_id = EXCLUDED.tool_type_id, tool_tier = EXCLUDED.tool_tier, removed_at = NULL,
      last_import_id = EXCLUDED.last_import_id, updated_at = EXCLUDED.updated_at`

  const recipeIds = new Map(
    (await tx.extractionRecipe.findMany({ select: { id: true, source: true, gameId: true } })).map(
      (r) => [`${r.source}:${r.gameId}`, r.id]
    )
  )
  await tx.$executeRaw`
    DELETE FROM extraction_recipe_outputs
    WHERE extraction_recipe_id IN
      (SELECT id FROM extraction_recipes WHERE last_import_id = ${stamp.importId})`

  const outputs: object[] = []
  for (const row of rows) {
    const ownerId = recipeIds.get(`${row.source}:${row.gameId}`)!
    for (const s of resolveStacks(row.outputs, itemIds, summary)) {
      outputs.push({ owner_id: ownerId, item_id: s.itemId, quantity: s.quantity })
    }
  }
  await insertStacks(tx, 'extraction_recipe_outputs', 'extraction_recipe_id', outputs)
}

/** What this import did not bring left the game: removed_at, never a delete */
function markRemoved(tx: Tx, table: string, stamp: Stamp) {
  return tx.$executeRaw`
    UPDATE ${Prisma.raw(table)} SET removed_at = ${stamp.now}
    WHERE removed_at IS NULL AND (last_import_id IS NULL OR last_import_id <> ${stamp.importId})`
}
