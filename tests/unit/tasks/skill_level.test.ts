import { describe, expect, test } from 'vitest'
import { levelTier } from '@/services/game_data/transform'
import { levelFromXp } from '@/services/tasks/skill_level'

describe('skill levels and tiers', () => {
  test('the level of an amount of XP', () => {
    expect([0, 519, 520, 57739, 57740, 2053471040, 9e9].map(levelFromXp)).toEqual([
      1, 1, 2, 24, 25, 120, 120,
    ])
  })

  test('the tier of a level: below 20 is T1, then one tier every 10 levels up to T10', () => {
    expect([1, 10, 19, 20, 25, 45, 99, 100, 120].map(levelTier)).toEqual([
      1, 1, 1, 2, 2, 4, 9, 10, 10,
    ])
  })
})
