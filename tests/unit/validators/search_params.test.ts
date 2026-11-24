import { describe, expect, test } from 'vitest'
import { escapeLike, searchWords } from '@/lib/search'
import { pageHref, plainQuery } from '@/lib/urls'
import { itemIdSchema } from '@/validators/item'
import { recipeSearchSchema } from '@/validators/recipe'
import { parseSearchParams } from '@/validators/search_params'

describe('query string filters', () => {
  test('empty fields are the same as absent ones', () => {
    expect(
      parseSearchParams(recipeSearchSchema, { q: '', skill: '2', station: '', verb: '' })
    ).toEqual({ skill: 2 })
  })

  test('a filter that does not validate falls back to its default, the others stay', () => {
    expect(
      parseSearchParams(recipeSearchSchema, { kind: 'magic', tier: '99', skill: 'x', q: 'plank' })
    ).toEqual({ q: 'plank' })
  })

  test('a repeated parameter counts once; checkboxes read "true", "1" and "on"', () => {
    expect(parseSearchParams(recipeSearchSchema, { page: ['3', '9'], all: 'on' })).toEqual({
      page: 3,
      all: true,
    })
  })

  test('an item id is a positive whole number', () => {
    expect(itemIdSchema.safeParse('157').data).toBe(157)
    for (const bad of ['abc', '0', '-1', '1.5', '99999999999']) {
      expect(itemIdSchema.safeParse(bad).success).toBe(false)
    }
  })
})

describe('search words', () => {
  test('split, lowercased, blanks dropped', () => {
    expect(searchWords('  Simple   PLANK ')).toEqual(['simple', 'plank'])
    expect(searchWords(undefined)).toEqual([])
  })

  test('LIKE wildcards are literal', () => {
    expect(escapeLike('100%_a\\b')).toBe('100\\%\\_a\\\\b')
  })
})

describe('list urls', () => {
  test('a page keeps the filters; page 1 has no page parameter', () => {
    const query = plainQuery({ q: 'plank', page: '2', skill: ['3', '4'], verb: '' })
    expect(query).toEqual({ q: 'plank', page: '2', skill: '3' })
    expect(pageHref('/recipes', query, 3)).toBe('/recipes?q=plank&page=3&skill=3')
    expect(pageHref('/recipes', query, 1)).toBe('/recipes?q=plank&skill=3')
    expect(pageHref('/recipes', {}, 1)).toBe('/recipes')
  })
})
