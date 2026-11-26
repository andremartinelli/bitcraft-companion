import { beforeEach, describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import { ANY_PROFESSION, NO_PROFESSION } from '@/services/inventory/professions'
import {
  holdersByItem,
  inventoryListing,
  itemStock,
  stockTotals,
  type StockSection,
} from '@/services/inventory/stock'
import InventorySync from '@/services/game_sync/inventory_sync'
import { bitjitaSource, CLAIM } from '../../helpers/bitjita'
import { fixtureTables, importTables } from '../../helpers/game_data'
import { charactersOnly, syncBothPlayers } from '../../helpers/inventory'

const summary = (sections: StockSection[]) =>
  sections.map((section) => ({
    title: section.title,
    items: section.lines.map((line) => `${line.item.name}: ${line.quantity}`),
  }))

describe('inventory listing', () => {
  let playerIds: number[]

  beforeEach(async () => {
    await importTables()
    playerIds = (await syncBothPlayers()).playerIds
  })

  test('by profession: the skill of the recipe that makes each item', async () => {
    const { sections } = await inventoryListing(charactersOnly(playerIds), 'professions')

    expect(summary(sections)).toEqual([
      {
        title: 'Carpentry',
        items: [
          'Rough Plank: 68',
          'Rough Stripped Wood: 10',
          // Only a Scrap recipe makes it: still Carpentry
          'Rough Wood Scraps: 10',
          'Simple Plank: 2',
        ],
      },
      { title: 'Forestry', items: ['Rough Tree Bark: 10', 'Rough Wood Log: 27'] },
      { title: NO_PROFESSION, items: ['Rough Wood Trunk: 3'] },
    ])
  })

  test('recipes of the game skill "ANY" go under "Qualquer profissão"', async () => {
    const tables = fixtureTables()
    tables.crafting_recipe_desc.find(
      (recipe: { id: number }) => recipe.id === 104
    ).level_requirements = [{ skill_id: 1, level: 1 }]
    await importTables(tables)

    const { sections } = await inventoryListing(charactersOnly(playerIds), 'professions')
    expect(sections.map((section) => section.title)).toEqual([
      'Carpentry',
      'Forestry',
      ANY_PROFESSION,
      NO_PROFESSION,
    ])
    expect(sections[2].lines.map((line) => line.item.name)).toEqual(['Simple Plank'])
  })

  test('each line says where the item is and whose it is', async () => {
    const { sections } = await inventoryListing(charactersOnly(playerIds), 'professions', 'rough plank')

    const plank = sections[0].lines[0]
    expect(plank.item.name).toBe('Rough Plank')
    // The claim chest (100 more) is not read: no access to it
    expect(plank.where).toEqual([
      { container: 'Settlement Stash', owner: 'Nimbus', quantity: 40 },
      { container: 'Depósito A', owner: 'Quartz', quantity: 12 },
      { container: 'Banco', owner: 'Nimbus', quantity: 10 },
      { container: 'Settlement Stash', owner: 'Quartz', quantity: 6 },
    ])
  })

  test('the search finds every word, ignoring case; "_" is a letter, not a wildcard', async () => {
    const { sections } = await inventoryListing(charactersOnly(playerIds), 'all', 'PLANK')
    expect(summary(sections)[0].items).toEqual(['Rough Plank: 68', 'Simple Plank: 2'])

    const none = await inventoryListing(charactersOnly(playerIds), 'all', 'rough_plank')
    expect(none.sections[0].lines).toEqual([])
  })

  test('"Tudo" sums both players, in one section', async () => {
    const { sections } = await inventoryListing(charactersOnly(playerIds), 'all', 'rough plank')

    expect(sections).toHaveLength(1)
    expect(sections[0].lines[0].quantity).toBe(68)
    expect(sections[0].lines[0].where).toHaveLength(4)
  })

  test('per place: each place is a section with its own key, the players first', async () => {
    const { sections } = await inventoryListing(charactersOnly(playerIds), 'places')

    const keys = sections.map((section) => section.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(sections.map((section) => section.title)).toEqual(
      expect.arrayContaining(['Settlement Stash', "Nimbus's Cart (II)", 'Depósito A', 'Banco'])
    )
    expect(sections.map((s) => s.title)).not.toContain('Baú de madeira')
    const bank = sections.find((section) => section.title === 'Banco')!
    expect(bank.subtitle).toBe('Nimbus')
    const house = sections.find((section) => section.title === 'Depósito A')!
    expect(house.subtitle).toBe('Quartz · casa')
  })

  test('the item page: how many they have and where', async () => {
    const plank = await db.item.findUniqueOrThrow({
      where: { kind_gameId: { kind: 'item', gameId: 1030 } },
    })

    const stock = await itemStock(plank.id, charactersOnly(playerIds))
    expect(stock.total).toBe(68)
    expect(stock.places[0]).toEqual({
      container: 'Settlement Stash',
      owner: 'Nimbus',
      quantity: 40,
    })
    expect(stock.places.map((place) => place.container)).not.toContain('Baú de madeira')
  })

  test('only the characters given: none shows nothing, one shows only it', async () => {
    expect((await inventoryListing(charactersOnly([]), 'all')).sections[0].lines).toEqual([])

    const { sections } = await inventoryListing(charactersOnly([playerIds[1]]), 'all', 'rough plank')
    expect(sections[0].lines[0].quantity).toBe(18)
    expect(sections[0].lines[0].where.map((place) => place.owner)).toEqual(['Quartz', 'Quartz'])
  })

  test("a counted claim's chests, under the claim's name", async () => {
    const user = await db.user.findFirstOrThrow({ where: { gamePlayerId: playerIds[0] } })
    await db.countedClaim.create({ data: { userId: user.id, claimEntityId: CLAIM.entityId } })
    await new InventorySync(bitjitaSource()).run('manual')
    const plank = await db.item.findUniqueOrThrow({
      where: { kind_gameId: { kind: 'item', gameId: 1030 } },
    })
    const owners = { playerIds, claimIds: [CLAIM.entityId] }

    const stock = await itemStock(plank.id, owners)
    expect(stock.total).toBe(168)
    expect(stock.places[0]).toEqual({
      container: 'Baú de madeira',
      owner: 'Claim Vila Teste',
      quantity: 100,
    })
    // The places tab lists the claim's chests (those with items) after the characters'
    const { sections } = await inventoryListing(owners, 'places')
    const subtitles = sections.map((section) => section.subtitle)
    const first = subtitles.indexOf('Claim Vila Teste · baús da claim')
    expect(first).toBeGreaterThan(0)
    expect(subtitles.slice(first).every((s) => s === 'Claim Vila Teste · baús da claim')).toBe(true)
    // Not counted on this page: as before
    expect((await itemStock(plank.id, charactersOnly(playerIds))).total).toBe(68)
    // The calculator's "já tenho" and the plan's "Coletar"
    expect((await stockTotals(owners)).get(plank.id)).toBe(168)
    expect((await holdersByItem(owners)).get(plank.id)?.[0]).toEqual({
      owner: 'Claim Vila Teste',
      quantity: 100,
    })
  })
})
