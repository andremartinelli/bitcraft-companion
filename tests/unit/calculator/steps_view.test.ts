import { describe, expect, test } from 'vitest'
import { isOtherProfession, mineFirst } from '@/services/calculator/steps_view'

describe('the steps of other professions', () => {
  test('a named profession the account does not do is another one', () => {
    expect(isOtherProfession('Fishing', ['Mining'])).toBe(true)
    expect(isOtherProfession('Mining', ['Mining'])).toBe(false)
  })

  test('"any profession" and no recipe are never another one', () => {
    expect(isOtherProfession(null, ['Mining'])).toBe(false)
  })

  test('an account with no profession marked filters nothing', () => {
    expect(isOtherProfession('Fishing', [])).toBe(false)
  })

  test('the account professions come first, the rest keeps its order', () => {
    const groups = ['Carpentry', 'Fishing', 'Mining', null].map((skill) => ({ skill }))
    expect(mineFirst(groups, ['Mining', 'Fishing']).map((g) => g.skill)).toEqual([
      'Fishing',
      'Mining',
      'Carpentry',
      null,
    ])
  })
})
