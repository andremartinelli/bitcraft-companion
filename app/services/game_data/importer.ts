import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'
import GameDataImport from '#models/game_data_import'
import RecipeGraph from '#services/calculator/recipe_graph'
import type { GameDataSource } from '#services/game_data/source'
import {
  itemKey,
  toConstructionRecipeRows,
  toClaimTechRows,
  toCraftingRecipeRows,
  toExtractionRecipeRows,
  toItemListRows,
  toItemRows,
  type ClaimTechRow,
  type ExtractionRecipeRow,
  type ItemKey,
  type RecipeRow,
  type StackRow,
} from '#services/game_data/transform'

export interface ImportSummary {
  importId: number
  counts: Record<string, number>
  added: { items: number; itemLists: number; recipes: number }
  removed: { items: number; itemLists: number; recipes: number }
  renamed: { kind: string; gameId: number; from: string; to: string }[]
  /** References in the game data to things the game data does not define */
  skipped: { missingItems: number; unknownLookups: number }
}

const BATCH = 500

function chunks<T>(rows: T[], size = BATCH): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

/**
 * Imports the static game data in one transaction. Re-running it with the
 * same data changes nothing. Rows that left the game get `removed_at`
 * instead of being deleted, because user data will point at them.
 */
export default class GameDataImporter {
  constructor(private onProgress: (message: string) => void = () => {}) {}

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
    }

    // Transform everything first: a format error must stop the import before any write.
    const itemRows = toItemRows(tables.items, tables.cargo)
    const names = new Map(itemRows.map((row) => [itemKey(row.kind, row.gameId), row.name]))
    const buildingNames = new Map<number, string>(tables.buildings.map((b) => [b.id, b.name]))
    const listRows = toItemListRows(tables.lists)
    const recipeRows = [
      ...toCraftingRecipeRows(tables.crafting, names),
      ...toConstructionRecipeRows(tables.construction, buildingNames),
    ]
    const claimTechRows = toClaimTechRows(tables.claimTechs)
    const extractionRows = toExtractionRecipeRows(tables.extraction)

    const result = await db.transaction(async (trx) => {
      const now = DateTime.now()
      const stamp = now.toSQL({ includeOffset: false })
      const record = await GameDataImport.create(
        { source: info.source, commitSha: info.commitSha, sourceDate: info.date },
        { client: trx }
      )
      const summary: ImportSummary = {
        importId: record.id,
        counts: {},
        added: { items: 0, itemLists: 0, recipes: 0 },
        removed: { items: 0, itemLists: 0, recipes: 0 },
        renamed: [],
        skipped: { missingItems: 0, unknownLookups: 0 },
      }

      this.onProgress('Tabelas de apoio (skills, ferramentas, estações)')
      const lookups = {
        skills: await this.#upsertLookup(trx, 'skills', tables.skills),
        toolTypes: await this.#upsertLookup(trx, 'tool_types', tables.toolTypes),
        buildingTypes: await this.#upsertLookup(trx, 'building_types', tables.buildingTypes),
      }

      this.onProgress(`Itens (${itemRows.length})`)
      const itemIds = await this.#upsertItems(trx, itemRows, record.id, stamp!, summary)

      this.onProgress(`Saídas aleatórias (${listRows.length})`)
      await this.#upsertItemLists(trx, listRows, itemIds, record.id, stamp!, summary)

      this.onProgress(`Receitas (${recipeRows.length})`)
      await this.#upsertRecipes(trx, recipeRows, itemIds, lookups, record.id, stamp!, summary)

      this.onProgress(`Pesquisas do assentamento (${claimTechRows.length})`)
      await this.#upsertClaimTechs(trx, claimTechRows, itemIds, record.id, stamp!, summary)

      this.onProgress(`Coletas (${extractionRows.length})`)
      await this.#upsertExtractionRecipes(
        trx,
        extractionRows,
        itemIds,
        lookups,
        record.id,
        stamp!,
        summary
      )

      this.onProgress('Marcando o que saiu do jogo')
      for (const [table, key] of [
        ['items', 'items'],
        ['item_lists', 'itemLists'],
        ['recipes', 'recipes'],
      ] as const) {
        summary.removed[key] = await trx
          .knexQuery()
          .table(table)
          .whereNull('removed_at')
          .where((q) => q.whereNull('last_import_id').orWhereNot('last_import_id', record.id))
          .update({ removed_at: stamp })
      }
      for (const table of ['claim_techs', 'extraction_recipes']) {
        await trx
          .knexQuery()
          .table(table)
          .whereNull('removed_at')
          .where((q) => q.whereNull('last_import_id').orWhereNot('last_import_id', record.id))
          .update({ removed_at: stamp })
      }

      summary.counts = {
        items: itemRows.filter((row) => row.kind === 'item').length,
        cargo: itemRows.filter((row) => row.kind === 'cargo').length,
        itemLists: listRows.length,
        craftingRecipes: recipeRows.filter((row) => row.kind === 'crafting').length,
        constructionRecipes: recipeRows.filter((row) => row.kind === 'construction').length,
        claimTechs: claimTechRows.length,
        extractionRecipes: extractionRows.length,
      }
      record.merge({ counts: summary.counts, renamed: summary.renamed, finishedAt: now })
      await record.useTransaction(trx).save()

      return summary
    })

    // The calculator keeps the recipe graph in memory
    RecipeGraph.invalidate()
    return result
  }

  async #upsertLookup(trx: TransactionClientContract, table: string, rows: any[]) {
    const values = rows.map((row) => ({ id: row.id, name: row.name }))
    for (const batch of chunks(values)) {
      await trx.knexQuery().table(table).insert(batch).onConflict('id').merge(['name'])
    }
    return new Set<number>(values.map((v) => v.id))
  }

  async #upsertItems(
    trx: TransactionClientContract,
    rows: ReturnType<typeof toItemRows>,
    importId: number,
    stamp: string,
    summary: ImportSummary
  ) {
    const existing = await trx.knexQuery().table('items').select('kind', 'game_id', 'name')
    const before = new Map<ItemKey, string>(
      existing.map((row: any) => [itemKey(row.kind, row.game_id), row.name])
    )

    for (const row of rows) {
      const previous = before.get(itemKey(row.kind, row.gameId))
      if (previous === undefined) summary.added.items++
      else if (previous !== row.name)
        summary.renamed.push({ kind: row.kind, gameId: row.gameId, from: previous, to: row.name })
    }

    const values = rows.map((row) => ({
      kind: row.kind,
      game_id: row.gameId,
      name: row.name,
      description: row.description,
      tier: row.tier,
      tag: row.tag,
      rarity: row.rarity,
      item_list_game_id: row.itemListGameId,
      removed_at: null,
      last_import_id: importId,
      created_at: stamp,
      updated_at: stamp,
    }))
    const updatable = Object.keys(values[0] ?? {}).filter((column) => column !== 'created_at')
    for (const batch of chunks(values)) {
      await trx
        .knexQuery()
        .table('items')
        .insert(batch)
        .onConflict(['kind', 'game_id'])
        .merge(updatable)
    }

    const ids = await trx.knexQuery().table('items').select('id', 'kind', 'game_id')
    return new Map<ItemKey, number>(ids.map((row: any) => [itemKey(row.kind, row.game_id), row.id]))
  }

  #resolveStacks(stacks: StackRow[], itemIds: Map<ItemKey, number>, summary: ImportSummary) {
    const resolved: { itemId: number; quantity: number }[] = []
    for (const stack of stacks) {
      const itemId = itemIds.get(stack.key)
      if (itemId === undefined) summary.skipped.missingItems++
      else resolved.push({ itemId, quantity: stack.quantity })
    }
    return resolved
  }

  async #upsertItemLists(
    trx: TransactionClientContract,
    rows: ReturnType<typeof toItemListRows>,
    itemIds: Map<ItemKey, number>,
    importId: number,
    stamp: string,
    summary: ImportSummary
  ) {
    const existingLists: any[] = await trx.knexQuery().table('item_lists').select('game_id')
    const existing = new Set(existingLists.map((r) => r.game_id))
    summary.added.itemLists = rows.filter((row) => !existing.has(row.gameId)).length

    const values = rows.map((row) => ({
      game_id: row.gameId,
      name: row.name,
      removed_at: null,
      last_import_id: importId,
      created_at: stamp,
      updated_at: stamp,
    }))
    for (const batch of chunks(values)) {
      await trx
        .knexQuery()
        .table('item_lists')
        .insert(batch)
        .onConflict('game_id')
        .merge(['name', 'removed_at', 'last_import_id', 'updated_at'])
    }

    const listRowsInDb: any[] = await trx.knexQuery().table('item_lists').select('id', 'game_id')
    const listIds = new Map<number, number>(listRowsInDb.map((r) => [r.game_id, r.id]))
    const currentLists = trx
      .knexQuery()
      .table('item_lists')
      .select('id')
      .where('last_import_id', importId)
    const currentPossibilities = trx
      .knexQuery()
      .table('item_list_possibilities')
      .select('id')
      .whereIn('item_list_id', currentLists.clone())
    await trx
      .knexQuery()
      .table('item_list_possibility_items')
      .whereIn('possibility_id', currentPossibilities)
      .delete()
    await trx
      .knexQuery()
      .table('item_list_possibilities')
      .whereIn('item_list_id', currentLists)
      .delete()

    const possibilityItems: { possibility_id: number; item_id: number; quantity: number }[] = []
    for (const row of rows) {
      for (const possibility of row.possibilities) {
        const [id] = await trx
          .knexQuery()
          .table('item_list_possibilities')
          .insert({ item_list_id: listIds.get(row.gameId), probability: possibility.probability })
          .returning('id')
        const possibilityId = typeof id === 'object' ? id.id : id
        for (const stack of this.#resolveStacks(possibility.items, itemIds, summary)) {
          possibilityItems.push({
            possibility_id: possibilityId,
            item_id: stack.itemId,
            quantity: stack.quantity,
          })
        }
      }
    }
    for (const batch of chunks(possibilityItems)) {
      await trx.knexQuery().table('item_list_possibility_items').insert(batch)
    }
  }

  async #upsertRecipes(
    trx: TransactionClientContract,
    rows: RecipeRow[],
    itemIds: Map<ItemKey, number>,
    lookups: { skills: Set<number>; toolTypes: Set<number>; buildingTypes: Set<number> },
    importId: number,
    stamp: string,
    summary: ImportSummary
  ) {
    const existingRecipes: any[] = await trx.knexQuery().table('recipes').select('kind', 'game_id')
    const existing = new Set(existingRecipes.map((r) => `${r.kind}:${r.game_id}`))
    summary.added.recipes = rows.filter((row) => !existing.has(`${row.kind}:${row.gameId}`)).length

    const known = (set: Set<number>, id: number | null) => {
      if (id === null) return null
      if (set.has(id)) return id
      summary.skipped.unknownLookups++
      return null
    }

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
      removed_at: null,
      last_import_id: importId,
      created_at: stamp,
      updated_at: stamp,
    }))
    const updatable = Object.keys(values[0] ?? {}).filter((column) => column !== 'created_at')
    for (const batch of chunks(values)) {
      await trx
        .knexQuery()
        .table('recipes')
        .insert(batch)
        .onConflict(['kind', 'game_id'])
        .merge(updatable)
    }

    const recipeRowsInDb: any[] = await trx
      .knexQuery()
      .table('recipes')
      .select('id', 'kind', 'game_id')
    const recipeIds = new Map<string, number>(
      recipeRowsInDb.map((r) => [`${r.kind}:${r.game_id}`, r.id])
    )
    const currentRecipes = trx
      .knexQuery()
      .table('recipes')
      .select('id')
      .where('last_import_id', importId)
    await trx
      .knexQuery()
      .table('recipe_inputs')
      .whereIn('recipe_id', currentRecipes.clone())
      .delete()
    await trx.knexQuery().table('recipe_outputs').whereIn('recipe_id', currentRecipes).delete()

    const inputs: { recipe_id: number; item_id: number; quantity: number }[] = []
    const outputs: { recipe_id: number; item_id: number; quantity: number }[] = []
    for (const row of rows) {
      const recipeId = recipeIds.get(`${row.kind}:${row.gameId}`)!
      for (const s of this.#resolveStacks(row.inputs, itemIds, summary)) {
        inputs.push({ recipe_id: recipeId, item_id: s.itemId, quantity: s.quantity })
      }
      for (const s of this.#resolveStacks(row.outputs, itemIds, summary)) {
        outputs.push({ recipe_id: recipeId, item_id: s.itemId, quantity: s.quantity })
      }
    }
    for (const batch of chunks(inputs)) await trx.knexQuery().table('recipe_inputs').insert(batch)
    for (const batch of chunks(outputs)) await trx.knexQuery().table('recipe_outputs').insert(batch)
  }

  async #upsertClaimTechs(
    trx: TransactionClientContract,
    rows: ClaimTechRow[],
    itemIds: Map<ItemKey, number>,
    importId: number,
    stamp: string,
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
      removed_at: null,
      last_import_id: importId,
      created_at: stamp,
      updated_at: stamp,
    }))
    const updatable = Object.keys(values[0] ?? {}).filter((column) => column !== 'created_at')
    for (const batch of chunks(values)) {
      await trx
        .knexQuery()
        .table('claim_techs')
        .insert(batch)
        .onConflict('game_id')
        .merge(updatable)
    }

    const techRows: any[] = await trx.knexQuery().table('claim_techs').select('id', 'game_id')
    const techIds = new Map<number, number>(techRows.map((r) => [r.game_id, r.id]))
    const current = trx
      .knexQuery()
      .table('claim_techs')
      .select('id')
      .where('last_import_id', importId)
    await trx.knexQuery().table('claim_tech_inputs').whereIn('claim_tech_id', current).delete()

    const inputs: { claim_tech_id: number; item_id: number; quantity: number }[] = []
    for (const row of rows) {
      const claimTechId = techIds.get(row.gameId)!
      for (const s of this.#resolveStacks(row.inputs, itemIds, summary)) {
        inputs.push({ claim_tech_id: claimTechId, item_id: s.itemId, quantity: s.quantity })
      }
    }
    for (const batch of chunks(inputs)) {
      await trx.knexQuery().table('claim_tech_inputs').insert(batch)
    }
  }

  async #upsertExtractionRecipes(
    trx: TransactionClientContract,
    rows: ExtractionRecipeRow[],
    itemIds: Map<ItemKey, number>,
    lookups: { skills: Set<number>; toolTypes: Set<number> },
    importId: number,
    stamp: string,
    summary: ImportSummary
  ) {
    const known = (set: Set<number>, id: number | null) => {
      if (id === null) return null
      if (set.has(id)) return id
      summary.skipped.unknownLookups++
      return null
    }

    const values = rows.map((row) => ({
      game_id: row.gameId,
      verb: row.verb,
      skill_id: known(lookups.skills, row.skillId),
      skill_level: row.skillLevel,
      tool_type_id: known(lookups.toolTypes, row.toolTypeId),
      tool_tier: row.toolTier,
      removed_at: null,
      last_import_id: importId,
      created_at: stamp,
      updated_at: stamp,
    }))
    const updatable = Object.keys(values[0] ?? {}).filter((column) => column !== 'created_at')
    for (const batch of chunks(values)) {
      await trx
        .knexQuery()
        .table('extraction_recipes')
        .insert(batch)
        .onConflict('game_id')
        .merge(updatable)
    }

    const recipeRows: any[] = await trx
      .knexQuery()
      .table('extraction_recipes')
      .select('id', 'game_id')
    const recipeIds = new Map<number, number>(recipeRows.map((r) => [r.game_id, r.id]))
    const current = trx
      .knexQuery()
      .table('extraction_recipes')
      .select('id')
      .where('last_import_id', importId)
    await trx
      .knexQuery()
      .table('extraction_recipe_outputs')
      .whereIn('extraction_recipe_id', current)
      .delete()

    const outputs: { extraction_recipe_id: number; item_id: number; quantity: number }[] = []
    for (const row of rows) {
      const recipeId = recipeIds.get(row.gameId)!
      for (const s of this.#resolveStacks(row.outputs, itemIds, summary)) {
        outputs.push({ extraction_recipe_id: recipeId, item_id: s.itemId, quantity: s.quantity })
      }
    }
    for (const batch of chunks(outputs)) {
      await trx.knexQuery().table('extraction_recipe_outputs').insert(batch)
    }
  }
}
