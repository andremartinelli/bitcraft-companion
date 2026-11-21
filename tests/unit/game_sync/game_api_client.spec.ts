import { test } from '@japa/runner'
import { decodeValue } from '#services/game_sync/game_api_client'
import { extractToken } from '#services/game_sync/game_auth'

// The Pocket / ItemStack shapes from BitCraftPublic (game_util.rs)
const itemType = {
  Sum: {
    variants: [
      { name: { some: 'Item' }, algebraic_type: { Product: { elements: [] } } },
      { name: { some: 'Cargo' }, algebraic_type: { Product: { elements: [] } } },
    ],
  },
}
const option = (inner: object) => ({
  Sum: {
    variants: [
      { name: { some: 'some' }, algebraic_type: inner },
      { name: { some: 'none' }, algebraic_type: { Product: { elements: [] } } },
    ],
  },
})
const itemStack = {
  Product: {
    elements: [
      { name: { some: 'item_id' }, algebraic_type: { I32: [] } },
      { name: { some: 'quantity' }, algebraic_type: { I32: [] } },
      { name: { some: 'item_type' }, algebraic_type: itemType },
      { name: { some: 'durability' }, algebraic_type: option({ I32: [] }) },
    ],
  },
}
const pocket = {
  Product: {
    elements: [
      { name: { some: 'volume' }, algebraic_type: { I32: [] } },
      { name: { some: 'contents' }, algebraic_type: option(itemStack) },
      { name: { some: 'locked' }, algebraic_type: { Bool: [] } },
    ],
  },
}

test.group('Game API decoding', () => {
  test('decodes pockets encoded as arrays with [tag, value] sums', ({ assert }) => {
    const value = [6000, [0, [1030, 12, [1, []], [1, []]]], false]

    assert.deepEqual(decodeValue(pocket, value), {
      volume: 6000,
      contents: { item_id: 1030, quantity: 12, item_type: 'Cargo', durability: null },
      locked: false,
    })
  })

  test('decodes sums encoded as { "tag": value } objects and empty pockets', ({ assert }) => {
    const full = [6000, { 0: [1010, 3, { 0: [] }, { 0: 250 }] }, false]
    const empty = [6000, { 1: [] }, false]

    assert.deepEqual(decodeValue(pocket, full), {
      volume: 6000,
      contents: { item_id: 1010, quantity: 3, item_type: 'Item', durability: 250 },
      locked: false,
    })
    assert.deepEqual(decodeValue(pocket, empty), { volume: 6000, contents: null, locked: false })
  })

  test('decodes arrays of pockets', ({ assert }) => {
    const decoded = decodeValue({ Array: pocket }, [[100, [1, []], true]])
    assert.deepEqual(decoded, [{ volume: 100, contents: null, locked: true }])
  })
})

test.group('Game auth', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl'

  test('finds the token in plain, quoted, Bearer and JSON responses', ({ assert }) => {
    assert.equal(extractToken(jwt), jwt)
    assert.equal(extractToken(`"${jwt}"`), jwt)
    assert.equal(extractToken(`Bearer ${jwt}`), jwt)
    assert.equal(extractToken(JSON.stringify({ data: { token: jwt } })), jwt)
  })

  test('returns null when there is no token', ({ assert }) => {
    assert.isNull(extractToken('{"error":"invalid code"}'))
    assert.isNull(extractToken('ok'))
  })
})
