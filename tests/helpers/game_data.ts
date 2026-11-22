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

/**
 * Armor pieces and tools in the shape of the real game data, for the quick
 * plans: craft results, a drop variant with no recipe, a recraft-only item,
 * two rarities of the same craft (T3) and a hand-made Flint tool next to the
 * station-made Ferralith one (T1). Also the items the settlement foundation
 * takes, with their real game ids.
 */
export function withSetsAndTools(tables: Record<GameTable, any[]> = fixtureTables()) {
  const item = (id: number, name: string, tier: number, tag: string, rarity = 'Common') => ({
    id,
    name,
    description: '',
    tier,
    tag,
    rarity,
    item_list_id: 0,
  })
  const recipe = (id: number, verb: string, output: number, station: number | null) => ({
    id,
    name: `${verb} {0}`,
    time_requirement: 1,
    stamina_requirement: 1,
    building_requirement: station === null ? null : { building_type: 20, tier: station },
    level_requirements: [{ skill_id: 3, level: 1 }],
    tool_requirements: [],
    consumed_item_stacks: [{ item_id: 1030, quantity: 2, item_type: 'Item' }],
    crafted_item_stacks: [{ item_id: output, quantity: 1, item_type: 'Item' }],
    actions_required: 10,
    is_passive: false,
    hide_without_required_knowledge: false,
  })

  tables.item_desc.push(
    item(9001, 'Simple Leather Belt', 2, 'Leather Clothing'),
    item(9002, 'Simple Leather Cap', 2, 'Leather Clothing'),
    item(9003, 'Simple Leather Belt', 2, 'Leather Clothing', 'Uncommon'),
    item(9011, 'Sturdy Leather Cap', 3, 'Leather Clothing'),
    item(9012, 'Sturdy Leather Cap', 3, 'Leather Clothing', 'Uncommon'),
    item(9013, 'Sturdy Leather Gloves', 3, 'Leather Clothing'),
    item(9021, 'Simple Woven Shirt', 2, 'Cloth Clothing'),
    item(9031, 'Pyrelite Plated Helm', 2, 'Metal Armor'),
    item(9032, 'Pyrelite Duelist Helm', 2, 'Metal Armor'),
    item(9033, 'Pyrelite Plated Boots', 2, 'Metal Armor'),
    item(9041, 'Flint Axe', 1, 'Forester Tool'),
    item(9042, 'Ferralith Axe', 1, 'Forester Tool'),
    item(9043, 'Ferralith Pickaxe', 1, 'Miner Tool'),
    item(9044, 'Cooking Pot', 1, 'Cook Tool'),
    item(9051, 'Pyrelite Axe', 2, 'Forester Tool'),
    item(78117662, "Beginner's Settlement Research", 1, 'Research'),
    item(1, 'Hex Coin', -1, 'Currency')
  )
  tables.crafting_recipe_desc.push(
    recipe(901, 'Craft', 9001, 2),
    recipe(902, 'Craft', 9002, 2),
    recipe(911, 'Craft', 9011, 3),
    recipe(912, 'Craft', 9012, 3),
    recipe(913, 'Recraft', 9013, 3),
    recipe(921, 'Craft', 9021, 2),
    recipe(931, 'Craft', 9031, 2),
    recipe(932, 'Craft', 9032, 2),
    recipe(933, 'Craft', 9033, 2),
    recipe(941, 'Craft', 9041, null),
    recipe(942, 'Craft', 9042, 1),
    recipe(943, 'Craft', 9043, 1),
    recipe(944, 'Craft', 9044, null),
    recipe(951, 'Craft', 9051, 2)
  )
  return tables
}
