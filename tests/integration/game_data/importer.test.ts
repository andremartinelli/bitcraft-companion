import { describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import { deserializeGraph } from '@/services/calculator/recipe_graph'
import { GameDataFormatError } from '@/services/game_data/transform'
import { fixtureTables, importTables, withHunting } from '../../helpers/game_data'

const recipeWith = (kind: 'crafting' | 'construction', gameId: number) =>
  db.recipe.findUniqueOrThrow({
    where: { kind_gameId: { kind, gameId } },
    include: { inputs: { include: { item: true } }, skill: true, buildingType: true },
  })

describe('game data importer', () => {
  test('imports items and cargo with the same game id as two rows', async () => {
    const summary = await importTables()

    expect(summary.counts).toEqual({
      // 3 of them are the knowledge items the task quests reward
      items: 10,
      cargo: 1,
      itemLists: 1,
      craftingRecipes: 5,
      constructionRecipes: 1,
      claimTechs: 6,
      extractionRecipes: 3,
      hunting: 0,
      travelerTasks: 4,
      taskTierUnlocks: 2,
    })
    const same = await db.item.findMany({ where: { gameId: 1010 }, orderBy: { kind: 'desc' } })
    expect(same.map((i) => [i.kind, i.name, i.iconAssetName])).toEqual([
      ['cargo', 'Rough Wood Trunk', null],
      ['item', 'Rough Wood Log', 'GeneratedIcons/Items/RoughWoodLog'],
    ])
  })

  test('stores resolved names, requirements and stacks', async () => {
    await importTables()

    const split = await recipeWith('crafting', 100)
    expect(split.name).toBe('Split Rough Wood Trunk into Rough Wood Log Output')
    expect(split.verb).toBe('Split')
    expect(split.skill?.name).toBe('Forestry')
    expect(split.buildingType?.name).toBe('Forestry Station')
    expect(split.inputs[0].item.kind).toBe('cargo')

    const treat = await recipeWith('crafting', 102)
    expect(treat.toolTypeId).toBeNull()
    expect(treat.hiddenWithoutKnowledge).toBe(true)

    const house = await recipeWith('construction', 50)
    expect(house.name).toBe('Starter House')
    expect(house.inputs).toHaveLength(2)
  })

  test('a random output points at its list, by our id too', async () => {
    await importTables()

    const output = await db.item.findFirstOrThrow({
      where: { itemListGameId: { not: null } },
      include: { itemList: { include: { possibilities: { include: { items: true } } } } },
    })
    expect(output.itemList?.gameId).toBe(output.itemListGameId)
    expect(output.itemList?.possibilities.map((p) => p.position)).toEqual(
      output.itemList?.possibilities.map((_, index) => index)
    )
    expect(output.itemList?.possibilities.every((p) => p.items.length > 0)).toBe(true)
  })

  test('skips references to items the game data does not define', async () => {
    const summary = await importTables()

    expect(summary.skipped.missingItems).toBe(1)
    expect((await recipeWith('crafting', 104)).inputs).toHaveLength(1)
  })

  test('running twice changes nothing', async () => {
    await importTables()
    const second = await importTables()

    expect(second.added).toEqual({ items: 0, itemLists: 0, recipes: 0 })
    expect(second.removed).toEqual({ items: 0, itemLists: 0, recipes: 0 })
    expect(await db.item.count()).toBe(11)
    expect(await db.recipe.count()).toBe(6)
    expect(await db.itemListPossibility.count()).toBe(
      fixtureTables().item_list_desc.reduce((sum, list) => sum + list.possibilities.length, 0)
    )
    expect((await recipeWith('crafting', 104)).inputs).toHaveLength(1)
  })

  test('marks what left the game and restores it when it comes back', async () => {
    await importTables()

    const tables = fixtureTables()
    tables.item_desc = tables.item_desc.filter((item) => item.id !== 1060)
    tables.crafting_recipe_desc = tables.crafting_recipe_desc.filter((r) => r.id !== 103)
    const summary = await importTables(tables)

    expect(summary.removed).toEqual({ items: 1, itemLists: 0, recipes: 1 })
    const scraps = { kind_gameId: { kind: 'item', gameId: 1060 } } as const
    expect((await db.item.findUniqueOrThrow({ where: scraps })).removedAt).not.toBeNull()
    const active = await db.recipe.findMany({ where: { removedAt: null } })
    expect(active.map((r) => r.gameId)).not.toContain(103)

    await importTables()
    expect((await db.item.findUniqueOrThrow({ where: scraps })).removedAt).toBeNull()
  })

  test('reports a game id that came back with another name', async () => {
    await importTables()

    const tables = fixtureTables()
    tables.item_desc.find((item) => item.id === 1030)!.name = 'Rough Board'
    const summary = await importTables(tables)

    expect(summary.renamed).toEqual([
      { kind: 'item', gameId: 1030, from: 'Rough Plank', to: 'Rough Board' },
    ])
    const record = await db.gameDataImport.findUniqueOrThrow({ where: { id: summary.importId } })
    expect(record.renamed).toEqual(summary.renamed)
  })

  test('imports the settlement researches with the items they take', async () => {
    await importTables()

    const homestead = await db.claimTech.findUniqueOrThrow({
      where: { gameId: 9301 },
      include: { inputs: { include: { item: true }, orderBy: { id: 'asc' } } },
    })
    expect(homestead.name).toBe('Tier 3 Homestead')
    expect(homestead.techType).toBe('Homestead')
    expect(homestead.suppliesCost).toBe(1125)
    expect(homestead.hidden).toBe(false)
    expect(homestead.inputs.map((i) => [i.item.kind, i.item.name, i.quantity])).toEqual([
      ['item', 'Rough Wood Scraps', 575],
      ['item', 'Simple Plank', 2],
      ['cargo', 'Rough Wood Trunk', 2],
    ])
    expect((await db.claimTech.findUniqueOrThrow({ where: { gameId: 9399 } })).hidden).toBe(true)
  })

  test('a settlement research that left the game is marked, and comes back', async () => {
    await importTables()

    const tables = fixtureTables()
    tables.claim_tech_desc = tables.claim_tech_desc.filter((tech) => tech.id !== 9401)
    await importTables(tables)
    const where = { gameId: 9401 }
    expect((await db.claimTech.findUniqueOrThrow({ where })).removedAt).not.toBeNull()

    await importTables()
    const back = await db.claimTech.findUniqueOrThrow({ where, include: { inputs: true } })
    expect(back.removedAt).toBeNull()
    expect(back.inputs).toHaveLength(2)
  })

  test('imports gathering with its skill, tool and the items it gives', async () => {
    await importTables()

    const chop = await db.extractionRecipe.findUniqueOrThrow({
      where: { source_gameId: { source: 'resource', gameId: 7001 } },
      include: { skill: true, outputs: { include: { item: true } } },
    })
    expect(chop.verb).toBe('Chop')
    expect(chop.skill?.name).toBe('Forestry')
    expect(chop.toolTier).toBe(1)
    expect(chop.outputs.map((o) => [o.item.kind, o.item.name, o.quantity])).toEqual([
      ['cargo', 'Rough Wood Trunk', 1],
    ])
    // Some gatherings give nothing the game data lists (chests, quests)
    const open = await db.extractionRecipe.findUniqueOrThrow({
      where: { source_gameId: { source: 'resource', gameId: 7003 } },
      include: { outputs: true },
    })
    expect(open.outputs).toHaveLength(0)
  })

  test('hunting joins the gatherings: the body an animal leaves', async () => {
    const summary = await importTables(withHunting())

    expect(summary.counts.hunting).toBe(1)
    // Resource 7 and enemy 7 are different things
    const hunt = await db.extractionRecipe.findUniqueOrThrow({
      where: { source_gameId: { source: 'enemy', gameId: 7 } },
      include: { skill: true, outputs: { include: { item: true } } },
    })
    expect(hunt.verb).toBe('Hunt')
    expect(hunt.skill?.name).toBe('Hunting')
    expect(hunt.outputs.map((o) => [o.item.kind, o.item.name])).toEqual([['cargo', 'Cervus']])
  })

  test("travelers' tasks: who asks, the tier and the items; a task that left is marked", async () => {
    await importTables()
    const tasks = await db.travelerTask.findMany({
      orderBy: { gameId: 'asc' },
      include: { inputs: { include: { item: true }, orderBy: { id: 'asc' } } },
    })
    expect(
      tasks.map((t) => [
        t.gameId,
        t.traveler,
        t.minLevel,
        t.tier,
        t.inputs.map((i) => `${i.quantity} ${i.item.kind} ${i.item.name}`),
      ])
    ).toEqual([
      [9001, 'Brico', 1, 1, ['5 item Rough Plank']],
      [9002, 'Brico', 20, 2, ['3 item Simple Plank', '2 cargo Rough Wood Trunk']],
      [9003, 'Brico', 25, 2, ['10 item Rough Wood Scraps']],
      // No traveler gives XP in that skill
      [9004, null, 1, 1, ['4 item Rough Stripped Wood']],
    ])

    const tables = fixtureTables()
    tables.traveler_task_desc = tables.traveler_task_desc.filter((r) => r.id !== 9003)
    await importTables(tables)
    const gone = await db.travelerTask.findUniqueOrThrow({
      where: { gameId: 9003 },
      include: { inputs: true },
    })
    expect([gone.removedAt !== null, gone.inputs.length]).toEqual([true, 1])
  })

  test('the quests that unlock task tiers; a creature quest is not one, and a quest that left is marked', async () => {
    await importTables()
    const unlocks = await db.taskTierUnlock.findMany({ orderBy: { questChainGameId: 'asc' } })
    // 8001 (Tutorial) rewards no unlock; 8004 unlocks a creature's tasks, not a tier
    expect(unlocks.map((u) => [u.questChainGameId, u.skillId, u.tier])).toEqual([
      [8002, 15, 2],
      [8003, 15, 3],
    ])

    const tables = fixtureTables()
    tables.quest_chain_desc = tables.quest_chain_desc.filter((r) => r.id !== 8003)
    await importTables(tables)
    const gone = await db.taskTierUnlock.findUniqueOrThrow({ where: { questChainGameId: 8003 } })
    expect(gone.removedAt).not.toBeNull()
  })

  test('a gathering that left the game is marked, and comes back', async () => {
    await importTables()

    const tables = fixtureTables()
    tables.extraction_recipe_desc = tables.extraction_recipe_desc.filter((r) => r.id !== 7002)
    await importTables(tables)
    const where = { source_gameId: { source: 'resource', gameId: 7002 } } as const
    expect((await db.extractionRecipe.findUniqueOrThrow({ where })).removedAt).not.toBeNull()

    await importTables()
    expect((await db.extractionRecipe.findUniqueOrThrow({ where })).removedAt).toBeNull()
  })

  test('a format error writes nothing', async () => {
    const tables = fixtureTables()
    tables.crafting_recipe_desc[0].level_requirements.push({ skill_id: 3, level: 1 })

    await expect(importTables(tables)).rejects.toThrow(GameDataFormatError)
    expect(await db.item.count()).toBe(0)
    expect(await db.gameDataImport.count()).toBe(0)
  })

  test('stores the recipe graph of the import, and only then finishes it', async () => {
    await importTables()
    const summary = await importTables()
    // Only the latest graph is kept: no other is ever read
    expect(await db.recipeGraphSnapshot.count()).toBe(1)

    const record = await db.gameDataImport.findUniqueOrThrow({
      where: { id: summary.importId },
      include: { graph: true },
    })
    expect(record.finishedAt).not.toBeNull()
    const graph = deserializeGraph(record.graph!.data)
    const plank = await db.item.findFirstOrThrow({ where: { name: 'Rough Plank' } })
    expect(graph.items.get(plank.id)?.name).toBe('Rough Plank')
    expect(graph.producers.get(plank.id)?.length).toBeGreaterThan(0)
    expect(graph.constructions.size).toBe(1)
    const log = await db.item.findFirstOrThrow({ where: { name: 'Rough Wood Log' } })
    expect(graph.items.get(log.id)?.iconAssetName).toBe('GeneratedIcons/Items/RoughWoodLog')
  })
})
