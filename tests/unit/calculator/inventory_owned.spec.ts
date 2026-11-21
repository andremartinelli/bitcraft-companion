import { test } from '@japa/runner'
import { mergeOwned } from '#services/calculator/inventory_owned'

test.group('"Já tenho" with the inventory', () => {
  test('the inventory fills what was not typed', ({ assert }) => {
    const merged = mergeOwned({}, new Map([[1, 10]]))

    assert.deepEqual(merged, { owned: { 1: 10 }, sources: { 1: 'inventory' } })
  })

  test('a value typed by hand wins, even 0', ({ assert }) => {
    const merged = mergeOwned(
      { 1: 3, 2: 0 },
      new Map([
        [1, 10],
        [2, 50],
        [3, 7],
      ])
    )

    assert.deepEqual(merged.owned, { 1: 3, 2: 0, 3: 7 })
    assert.deepEqual(merged.sources, { 1: 'manual', 2: 'manual', 3: 'inventory' })
  })

  test('without inventory, only what was typed', ({ assert }) => {
    assert.deepEqual(mergeOwned({ 4: 2 }, null), { owned: { 4: 2 }, sources: { 4: 'manual' } })
  })

  test('items the group has none of stay out', ({ assert }) => {
    assert.deepEqual(mergeOwned({}, new Map([[5, 0]])), { owned: {}, sources: {} })
  })
})
