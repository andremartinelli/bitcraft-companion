import { beforeEach, describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import { ANY_PROFESSION, NO_PROFESSION } from '@/services/inventory/professions'
import { inventoryListing, itemStock, type StockSection } from '@/services/inventory/stock'
import { fixtureTables, importTables } from '../../helpers/game_data'
import { syncBothPlayers } from '../../helpers/inventory'

const summary = (sections: StockSection[]) =>
  sections.map((section) => ({
    title: section.title,
    items: section.lines.map((line) => `${line.item.name}: ${line.quantity}`),
  }))

describe('inventory listing', () => {
  let userId: number

  beforeEach(async () => {
    await importTables()
    userId = (await syncBothPlayers()).userId
  })

  test('by profession: the skill of the recipe that makes each item', async () => {
    const { sections } = await inventoryListing(userId, 'professions')

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

    const { sections } = await inventoryListing(userId, 'professions')
    expect(sections.map((section) => section.title)).toEqual([
      'Carpentry',
      'Forestry',
      ANY_PROFESSION,
      NO_PROFESSION,
    ])
    expect(sections[2].lines.map((line) => line.item.name)).toEqual(['Simple Plank'])
  })

  test('each line says where the item is and whose it is', async () => {
    const { sections } = await inventoryListing(userId, 'professions', 'rough plank')

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
    const { sections } = await inventoryListing(userId, 'group', 'PLANK')
    expect(summary(sections)[0].items).toEqual(['Rough Plank: 68', 'Simple Plank: 2'])

    const none = await inventoryListing(userId, 'group', 'rough_plank')
    expect(none.sections[0].lines).toEqual([])
  })

  test('the group tab sums both players, in one section', async () => {
    const { sections } = await inventoryListing(userId, 'group', 'rough plank')

    expect(sections).toHaveLength(1)
    expect(sections[0].lines[0].quantity).toBe(68)
    expect(sections[0].lines[0].where).toHaveLength(4)
  })

  test('per player: only what is theirs, without the claim chests', async () => {
    const { sections } = await inventoryListing(userId, 'players', 'rough plank')

    expect(summary(sections)).toEqual([
      { title: 'Nimbus', items: ['Rough Plank: 50'] },
      { title: 'Quartz', items: ['Rough Plank: 18'] },
    ])
  })

  test('per place: each place is a section with its own key, the players first', async () => {
    const { sections } = await inventoryListing(userId, 'places')

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

  test('the item page: how many the group has and where', async () => {
    const plank = await db.item.findUniqueOrThrow({
      where: { kind_gameId: { kind: 'item', gameId: 1030 } },
    })

    const stock = await itemStock(plank.id, userId)
    expect(stock.total).toBe(68)
    expect(stock.places[0]).toEqual({
      container: 'Settlement Stash',
      owner: 'Nimbus',
      quantity: 40,
    })
    expect(stock.places.map((place) => place.container)).not.toContain('Baú de madeira')
  })

  test("another account doesn't see them; following one character shows only it", async () => {
    const other = await db.user.create({ data: { email: 'outra@example.com', password: '-' } })
    expect((await inventoryListing(other.id, 'group')).sections[0].lines).toEqual([])

    const quartz = await db.gamePlayer.findUniqueOrThrow({
      where: { entityId: '100000000000000002' },
    })
    await db.userGamePlayer.create({ data: { userId: other.id, gamePlayerId: quartz.id } })
    const { sections } = await inventoryListing(other.id, 'players', 'rough plank')
    expect(summary(sections)).toEqual([{ title: 'Quartz', items: ['Rough Plank: 18'] }])
  })
})
