import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import GameDataImporter from '@/services/game_data/importer'
import { GAME_TABLES, MemorySource, type GameTable, type RawRow } from '@/services/game_data/source'

const FIXTURES = fileURLToPath(new URL('../fixtures/game_data/', import.meta.url))

/** A fresh, mutable copy of the fixture tables */
export function fixtureTables(): Record<GameTable, RawRow[]> {
  return Object.fromEntries(
    GAME_TABLES.map((table) => [
      table,
      JSON.parse(readFileSync(`${FIXTURES}${table}.json`, 'utf8')),
    ])
  ) as Record<GameTable, RawRow[]>
}

export function importTables(tables: Record<GameTable, RawRow[]> = fixtureTables()) {
  return new GameDataImporter().run(new MemorySource(tables))
}

/**
 * Hunting as in the real game data (ids too): hunting a Female Cervus leaves
 * a "Cervus" body, and the Hunting Station makes pelts from either body, but
 * nothing leaves a "Female Cervus" body any more.
 */
export function withHunting(tables: Record<GameTable, RawRow[]> = fixtureTables()) {
  const animal = (id: number, name: string) => ({
    id,
    name,
    description: 'An animal body that could be processed for meat and hides.',
    tier: 3,
    tag: 'Animal',
    rarity: 'Common',
  })
  const harvest = (id: number, cargoId: number) => ({
    id,
    name: 'Harvest {0}',
    time_requirement: 1,
    stamina_requirement: 1,
    building_requirement: { building_type: 44, tier: 3 },
    level_requirements: [{ skill_id: 9, level: 30 }],
    tool_requirements: [],
    consumed_item_stacks: [{ item_id: cargoId, quantity: 1, item_type: 'Cargo' }],
    crafted_item_stacks: [{ item_id: 9101, quantity: 1, item_type: 'Item' }],
    actions_required: 125,
    is_passive: false,
    hide_without_required_knowledge: false,
  })

  tables.skill_desc.push({ id: 9, name: 'Hunting' })
  tables.cargo_desc.push(animal(3, 'Female Cervus'), animal(4, 'Cervus'))
  tables.item_desc.push({
    id: 9101,
    name: 'Sturdy Raw Pelt',
    description: '',
    tier: 3,
    tag: 'Raw Pelt',
    rarity: 'Common',
    item_list_id: 0,
  })
  // The lower id takes the lost body: by id alone, it would be the default
  tables.crafting_recipe_desc.push(harvest(306000, 3), harvest(306001, 4))
  tables.enemy_desc.push(
    {
      enemy_type: 7,
      name: 'Female Cervus',
      huntable: true,
      extracted_item_stacks: [
        {
          item_stack: { item_id: 4, quantity: 1, item_type: 'Cargo', durability: null },
          probability: 1,
        },
      ],
      experience_per_damage_dealt: [{ skill_id: 9, quantity: 3.24 }],
    },
    // A monster that leaves nothing stays out
    {
      enemy_type: 40,
      name: 'Jakyl',
      huntable: false,
      extracted_item_stacks: [],
      experience_per_damage_dealt: [{ skill_id: 15, quantity: 1 }],
    }
  )
  return tables
}

/**
 * Armor pieces and tools in the shape of the real game data, for the quick
 * plans: craft results, a drop variant with no recipe, a recraft-only item,
 * two rarities of the same craft (T3) and a hand-made Flint tool next to the
 * station-made Ferralith one (T1). Also the items the settlement foundation
 * takes, with their real game ids.
 */
export function withSetsAndTools(tables: Record<GameTable, RawRow[]> = fixtureTables()) {
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

/**
 * A second way to make Rough Stripped Wood (recipe 106, "Carve"): 3 logs
 * give 2, in 50 actions. The saw (101) stays the default: lower id.
 */
export function withSecondStrippedWoodRecipe(
  tables: Record<GameTable, RawRow[]> = fixtureTables()
) {
  const saw = tables.crafting_recipe_desc.find((row) => row.id === 101)
  tables.crafting_recipe_desc.push({
    ...saw,
    id: 106,
    name: 'Carve {0}',
    consumed_item_stacks: [{ item_id: 1010, quantity: 3, item_type: 'Item' }],
    crafted_item_stacks: [{ item_id: 1020, quantity: 2, item_type: 'Item' }],
    actions_required: 50,
  })
  return tables
}
