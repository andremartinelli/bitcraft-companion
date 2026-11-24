import { describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import {
  buildRecipeGraph,
  deserializeGraph,
  getRecipeGraph,
  loadGraphRows,
} from '@/services/calculator/recipe_graph'
import { importTables } from '../../helpers/game_data'

describe('recipe graph', () => {
  test('the snapshot of the import is the graph the tables give', async () => {
    const { importId } = await importTables()

    const snapshot = await db.recipeGraphSnapshot.findUniqueOrThrow({ where: { importId } })
    expect(deserializeGraph(snapshot.data)).toEqual(buildRecipeGraph(await loadGraphRows(db)))
  })

  test('the graph is kept until the next import', async () => {
    await importTables()
    const first = await getRecipeGraph()
    expect(await getRecipeGraph()).toBe(first)

    await importTables()
    expect(await getRecipeGraph()).not.toBe(first)
  })

  test('without a snapshot, it is built from the tables', async () => {
    const { importId } = await importTables()
    await db.recipeGraphSnapshot.delete({ where: { importId } })
    // Another finished import, without a graph: as one made before the snapshots
    await db.gameDataImport.create({ data: { source: 'memory', finishedAt: new Date() } })

    const graph = await getRecipeGraph()
    expect(graph.recipes.size).toBeGreaterThan(0)
  })
})
