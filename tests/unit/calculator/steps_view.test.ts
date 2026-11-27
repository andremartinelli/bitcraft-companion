import { describe, expect, test } from 'vitest'
import { isOtherProfession, mineFirst } from '@/services/calculator/steps_view'

const ALL = ['Fishing', 'Mining']

describe('the steps of other professions', () => {
  test('a named profession the account does not do is another one', () => {
    expect(isOtherProfession('Fishing', ['Mining'], ALL)).toBe(true)
    expect(isOtherProfession('Mining', ['Mining'], ALL)).toBe(false)
  })

  test('"any profession" and no recipe are never another one', () => {
    expect(isOtherProfession(null, ['Mining'], ALL)).toBe(false)
  })

  test('skills that are not professions (Construction, Taming...) always show', () => {
    expect(isOtherProfession('Construction', ['Mining'], ALL)).toBe(false)
  })

  test('an account with no profession marked filters nothing', () => {
    expect(isOtherProfession('Fishing', [], ALL)).toBe(false)
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

  test('by profession, the gathering professions first within mine and within the others', () => {
    const groups = ['Carpentry', 'Fishing', 'Mining', 'Smithing', null].map((skill) => ({ skill }))
    expect(mineFirst(groups, ['Smithing', 'Mining'], true).map((g) => g.skill)).toEqual([
      'Mining',
      'Smithing',
      'Fishing',
      'Carpentry',
      null,
    ])
  })
})
