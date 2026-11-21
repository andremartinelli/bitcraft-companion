import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import GameDataImporter from '#services/game_data/importer'
import { GAME_TABLES, MemorySource, type GameTable } from '#services/game_data/source'

const FIXTURES = fileURLToPath(new URL('../fixtures/game_data/', import.meta.url))

/** A fresh, mutable copy of the fixture tables */
export function fixtureTables(): Record<GameTable, any[]> {
  return Object.fromEntries(
    GAME_TABLES.map((table) => [
      table,
      JSON.parse(readFileSync(`${FIXTURES}${table}.json`, 'utf8')),
    ])
  ) as Record<GameTable, any[]>
}

export function importTables(tables: Record<GameTable, any[]> = fixtureTables()) {
  return new GameDataImporter().run(new MemorySource(tables))
}
