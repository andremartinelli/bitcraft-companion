import { describe, expect, test } from 'vitest'
import { mergeOwned } from '@/services/calculator/inventory_owned'
import {
  addBuilding,
  addTarget,
  emptyState,
  readStateFromQuery,
  removeTarget,
  setChoice,
  setOwned,
  setTargetQuantity,
  setUseInventory,
  stateToQuery,
  validateState,
} from '@/services/calculator/state_params'

const query = (search: string) =>
  readStateFromQuery(Object.fromEntries(new URLSearchParams(search)))

describe('calculator state in the URL', () => {
  test('a short URL, read back as the same state', () => {
    const state = {
      targets: [
        { itemId: 157, quantity: 10 },
        { itemId: 388, quantity: 1 },
      ],
      buildings: [{ recipeId: 812, quantity: 2 }],
      choices: { 157: 'raw' as const, 155: 999 },
      owned: { 157: 0, 9: 40 },
      useInventory: false,
    }
    const url = stateToQuery(state)
    expect(url).toBe('t=157x10,388x1&b=812x2&c=155:999,157:raw&o=9:40,157:0&inv=0')
    expect(query(url)).toEqual({ state, errors: [] })
  })

  test('an empty calculator has an empty URL; the inventory is on by default', () => {
    expect(stateToQuery(emptyState())).toBe('')
    expect(query('')).toEqual({ state: emptyState(), errors: [] })
    expect(query('t=157x1').state.useInventory).toBe(true)
  })

  test('invalid values come back as the old messages, with an empty state', () => {
    expect(query('t=157x0')).toEqual({
      state: emptyState(),
      errors: ['A quantidade precisa ser um número inteiro entre 1 e 100.000.'],
    })
    for (const owned of ['-1', '2000000', '1.5']) {
      expect(query(`t=157x1&o=157:${owned}`).errors).toEqual([
        'O "já tenho" precisa ser um número inteiro entre 0 e 1.000.000.',
      ])
    }
    expect(query('b=812x5000').errors).toEqual([
      'A quantidade de uma construção precisa ser um número inteiro entre 1 e 1.000.',
    ])
    expect(query('t=abc').errors).toEqual(['Alguns dados do cálculo são inválidos.'])
    const many = Array.from({ length: 31 }, (_, i) => `${i + 1}x1`).join(',')
    expect(query(`t=${many}`).errors).toEqual(['Dá para calcular no máximo 30 itens de uma vez.'])
  })

  test('a state from a form or an action goes through the same rules', () => {
    const { errors } = validateState({ ...emptyState(), targets: [{ itemId: 1, quantity: 1.5 }] })
    expect(errors).toEqual(['A quantidade precisa ser um número inteiro entre 1 e 100.000.'])
  })
})

describe('changes from the panel', () => {
  test('adding an item puts it last with 1; one already there stays', () => {
    let state = addTarget(emptyState(), 157)
    state = setTargetQuantity(state, 0, 10)
    state = addTarget(state, 388)
    expect(addTarget(state, 157)).toBe(state)
    expect(state.targets).toEqual([
      { itemId: 157, quantity: 10 },
      { itemId: 388, quantity: 1 },
    ])
    expect(removeTarget(state, 0).targets).toEqual([{ itemId: 388, quantity: 1 }])
    expect(addBuilding(state, 812).buildings).toEqual([{ recipeId: 812, quantity: 1 }])
  })

  test('"Automático" and an empty "já tenho" remove the value; 0 stays', () => {
    let state = setChoice(emptyState(), 157, '999')
    state = setChoice(state, 155, 'raw')
    expect(state.choices).toEqual({ 157: 999, 155: 'raw' })
    expect(setChoice(state, 157, '').choices).toEqual({ 155: 'raw' })

    state = setOwned(state, 157, '0')
    expect(state.owned).toEqual({ 157: 0 })
    expect(setOwned(state, 157, ' ').owned).toEqual({})
    expect(setUseInventory(state, false).useInventory).toBe(false)
  })
})

describe('"Já tenho" with the inventory', () => {
  test('the inventory fills what was not typed', () => {
    expect(mergeOwned({}, new Map([[1, 10]]))).toEqual({
      owned: { 1: 10 },
      sources: { 1: 'inventory' },
    })
  })

  test('a value typed by hand wins, even 0', () => {
    const merged = mergeOwned(
      { 1: 3, 2: 0 },
      new Map([
        [1, 10],
        [2, 50],
        [3, 7],
      ])
    )
    expect(merged.owned).toEqual({ 1: 3, 2: 0, 3: 7 })
    expect(merged.sources).toEqual({ 1: 'manual', 2: 'manual', 3: 'inventory' })
  })

  test('without inventory, only what was typed; items nobody has stay out', () => {
    expect(mergeOwned({ 4: 2 }, null)).toEqual({ owned: { 4: 2 }, sources: { 4: 'manual' } })
    expect(mergeOwned({}, new Map([[5, 0]]))).toEqual({ owned: {}, sources: {} })
  })
})
