import { beforeEach, describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import { resolveItemList } from '@/services/calculator/item_list_resolver'
import { fixtureTables, importTables } from '../../helpers/game_data'

const itemId = async (gameId: number) =>
  (await db.item.findUniqueOrThrow({ where: { kind_gameId: { kind: 'item', gameId } } })).id

describe('resolving a pasted list', () => {
  beforeEach(() => importTables())

  test('names are exact, ignoring case; repeated lines sum', async () => {
    const plank = await itemId(1030)
    const house = await db.recipe.findFirstOrThrow({ where: { kind: 'construction' } })
    const result = await resolveItemList(`10 rough plank\nRough Plank x5\n2 ${house.name}`)
    expect(result).toEqual({
      items: [{ itemId: plank, name: 'Rough Plank', quantity: 15 }],
      buildings: [{ recipeId: house.id, name: house.name, quantity: 2 }],
      errors: [],
    })
  })

  test('a wrong name adds nothing and suggests the closest', async () => {
    const result = await resolveItemList('10 Rough Plank\n5 Rough Plnk\nRough Wood Log\n1 Zzzz')
    expect(result).toEqual({
      items: [],
      buildings: [],
      errors: [
        'Linha 2, “Rough Plnk”: não encontrado. Quis dizer Rough Plank?',
        'Linha 3, “Rough Wood Log”: falta a quantidade (ex.: 10 Rough Plank).',
        'Linha 4, “Zzzz”: não encontrado.',
      ],
    })
  })

  test('a removed item is not found', async () => {
    const tables = fixtureTables()
    tables.item_desc = tables.item_desc.filter((row) => row.id !== 5000)
    await importTables(tables)
    expect((await resolveItemList('1 Simple Plank')).errors).toEqual([
      'Linha 1, “Simple Plank”: não encontrado.',
    ])
  })

  test('repeated lines over the limit say so', async () => {
    expect((await resolveItemList('60000 Rough Plank\n60000 Rough Plank')).errors).toEqual([
      '“Rough Plank”: as linhas da lista somam mais que 100.000.',
    ])
  })

  test('a quantity over the limit is an error on its line', async () => {
    expect((await resolveItemList('100001 Rough Plank')).errors).toEqual([
      'Linha 1, “Rough Plank”: a quantidade vai de 1 a 100.000.',
    ])
  })
})
