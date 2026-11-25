import { describe, expect, test } from 'vitest'
import {
  addItemList,
  levenshtein,
  looksLikeList,
  parseItemList,
} from '@/services/calculator/item_list'
import { emptyState } from '@/services/calculator/state_params'

describe('pasted item list', () => {
  test('a list is several lines, JSON, or one line with a quantity; a name is a search', () => {
    expect(looksLikeList('Rough Plank')).toBe(false)
    expect(looksLikeList('10 Rough Plank')).toBe(true)
    expect(looksLikeList('Rough Plank x10')).toBe(true)
    expect(looksLikeList('Rough Plank: 10')).toBe(true)
    expect(looksLikeList('Rough Plank\nSimple Plank')).toBe(true)
    expect(looksLikeList('[{"name": "Rough Plank"}]')).toBe(true)
  })

  test('reads the three line formats, bullets and thousands', () => {
    const text =
      '10 Rough Plank\n\n- Simple Plank x 5\n2. Rough Wood Log: 1.000\nRough Tree Bark ×3'
    expect(parseItemList(text)).toEqual([
      { where: 'Linha 1', name: 'Rough Plank', quantity: 10 },
      { where: 'Linha 3', name: 'Simple Plank', quantity: 5 },
      { where: 'Linha 4', name: 'Rough Wood Log', quantity: 1000 },
      { where: 'Linha 5', name: 'Rough Tree Bark', quantity: 3 },
    ])
  })

  test('says which line has no quantity', () => {
    expect(parseItemList('10 Rough Plank\nSimple Plank')[1]).toEqual({
      error: 'Linha 2, “Simple Plank”: falta a quantidade (ex.: 10 Rough Plank).',
    })
    expect(parseItemList('0 Rough Plank')).toEqual([
      { error: 'Linha 1, “Rough Plank”: a quantidade precisa ser maior que zero.' },
    ])
    expect(parseItemList(' \n')).toEqual([{ error: 'A lista está vazia.' }])
  })

  test('reads JSON, with the entry that is wrong', () => {
    expect(parseItemList('[{"name": "Rough Plank", "quantity": 10}]')).toEqual([
      { where: 'Item 1', name: 'Rough Plank', quantity: 10 },
    ])
    expect(parseItemList('[{"name": "Rough Plank", "quantity": "10"}, {}]')).toEqual([
      {
        error: 'Item 1, “Rough Plank”: o "quantity" precisa ser um número inteiro maior que zero.',
      },
      { error: 'Item 2: falta o "name".' },
    ])
    expect(parseItemList('[{"name": ')).toEqual([
      { error: 'O JSON está inválido. Confira as aspas, as vírgulas e os colchetes.' },
    ])
  })

  test('a name ending in x is not a quantity; a fenced JSON is JSON', () => {
    expect(parseItemList('Rough Flax 10')).toEqual([
      { error: 'Linha 1, “Rough Flax 10”: falta a quantidade (ex.: 10 Rough Plank).' },
    ])
    expect(parseItemList('Rough Flax x10')).toEqual([
      { where: 'Linha 1', name: 'Rough Flax', quantity: 10 },
    ])
    const fenced = '```json\n[{"name": "Rough Plank", "quantity": 10}]\n```'
    expect(looksLikeList(fenced)).toBe(true)
    expect(parseItemList(fenced)).toEqual([{ where: 'Item 1', name: 'Rough Plank', quantity: 10 }])
  })

  test('levenshtein', () => {
    expect(levenshtein('rough plnk', 'rough plank')).toBe(1)
    expect(levenshtein('', 'abc')).toBe(3)
  })

  test('adds the list, summing what the calculation has', () => {
    const state = { ...emptyState(), targets: [{ itemId: 1, quantity: 10 }] }
    const { state: next, errors } = addItemList(state, {
      items: [
        { itemId: 1, name: 'Rough Plank', quantity: 5 },
        { itemId: 2, name: 'Simple Plank', quantity: 3 },
      ],
      buildings: [{ recipeId: 9, name: 'Campsite', quantity: 1 }],
    })
    expect(errors).toEqual([])
    expect(next.targets).toEqual([
      { itemId: 1, quantity: 15 },
      { itemId: 2, quantity: 3 },
    ])
    expect(next.buildings).toEqual([{ recipeId: 9, quantity: 1 }])
  })

  test('over a limit, nothing is added', () => {
    const state = { ...emptyState(), targets: [{ itemId: 1, quantity: 99_999 }] }
    const result = addItemList(state, {
      items: [{ itemId: 1, name: 'Rough Plank', quantity: 2 }],
      buildings: [],
    })
    expect(result.state).toBe(state)
    expect(result.errors).toEqual([
      'Rough Plank: somando com o que já está no cálculo, passaria de 100.000.',
    ])
    const many = Array.from({ length: 31 }, (_, i) => ({ itemId: i + 1, name: 'x', quantity: 1 }))
    expect(addItemList(emptyState(), { items: many, buildings: [] }).errors).toEqual([
      'Com a lista, o cálculo ficaria com 31 itens; o máximo é 30.',
    ])
  })
})
