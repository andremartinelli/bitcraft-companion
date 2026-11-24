import { beforeEach, describe, expect, test } from 'vitest'
import { GET } from '@/app/api/items/search/route'
import { db } from '@/lib/db'
import {
  consumingRecipes,
  findActiveItem,
  producingRecipes,
  searchBuildings,
  searchItems,
} from '@/models/item'
import { importTables } from '../../helpers/game_data'

const itemByGameId = (gameId: number) =>
  db.item.findUniqueOrThrow({ where: { kind_gameId: { kind: 'item', gameId } } })

describe('items', () => {
  beforeEach(() => importTables())

  test('a producer through a random output, with its chance', async () => {
    const bark = await itemByGameId(1050)
    const producers = await producingRecipes(bark.id)

    expect(producers).toHaveLength(1)
    expect(producers[0].recipe.name).toBe('Split Rough Wood Trunk into Rough Wood Log Output')
    expect(producers[0].chance).toBe(0.25)
  })

  test('how to get an item and where it is used, buildings included', async () => {
    const plank = await itemByGameId(1030)

    const producers = await producingRecipes(plank.id)
    expect(producers.map((p) => [p.recipe.name, p.quantity, p.chance])).toEqual([
      ['Treat Rough Stripped Wood Into Rough Plank', 1, null],
    ])
    const consumers = (await consumingRecipes(plank.id)).map((r) => r.name)
    expect(consumers).toHaveLength(3)
    expect(consumers).toContain('Craft Simple Plank')
    expect(consumers).toContain('Starter House')
  })

  test('an item that left the game has no page', async () => {
    const plank = await itemByGameId(1030)
    expect(await findActiveItem(plank.id)).not.toBeNull()

    await db.item.update({ where: { id: plank.id }, data: { removedAt: new Date() } })
    expect(await findActiveItem(plank.id)).toBeNull()
    expect((await searchItems('rough plank')).map((i) => i.id)).not.toContain(plank.id)
  })

  test('the search needs 2 letters and puts what is crafted first', async () => {
    expect(await searchItems('p')).toEqual([])

    // A recipe makes the first three (shorter names first); the others only
    // come from gathering, a random output or scrapping
    expect((await searchItems('rough')).map((i) => i.name)).toEqual([
      'Rough Plank',
      'Rough Stripped Wood',
      'Rough Wood Log Output',
      'Rough Wood Log',
      'Rough Tree Bark',
      'Rough Wood Trunk',
      'Rough Wood Scraps',
    ])
  })

  test('the picker finds buildings too', async () => {
    expect((await searchBuildings('house')).map((b) => b.name)).toEqual(['Starter House'])
    expect(await searchBuildings('h')).toEqual([])
  })

  test('GET /api/items/search answers items and buildings as JSON', async () => {
    const response = await GET(new Request('http://localhost/api/items/search?q=rough'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.items.map((i: { name: string }) => i.name)).toContain('Rough Plank')
    expect(body.buildings).toEqual([])

    const empty = await GET(new Request('http://localhost/api/items/search'))
    expect(await empty.json()).toEqual({ items: [], buildings: [] })
  })
})
