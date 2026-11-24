import { beforeEach, describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import { filterOptions, RECIPES_PER_PAGE, searchRecipes } from '@/models/recipe'
import { importTables } from '../../helpers/game_data'

const names = async (filters: Parameters<typeof searchRecipes>[0]) =>
  (await searchRecipes(filters)).recipes.map((recipe) => recipe.name)

describe('recipe search', () => {
  beforeEach(() => importTables())

  test('lists crafting recipes and hides scrap recipes by default', async () => {
    const list = await names({})
    expect(list).toContain('Saw Rough Stripped Wood')
    expect(list).not.toContain('Scrap Rough Plank')
    expect(list).not.toContain('Starter House')
  })

  test('shows scrap recipes when asked', async () => {
    expect(await names({ all: true })).toContain('Scrap Rough Plank')
    expect(await names({ verb: 'Scrap' })).toEqual(['Scrap Rough Plank'])
  })

  test('finds recipes by ingredient, product or random output content', async () => {
    const byIngredient = await names({ q: 'stripped' })
    expect(byIngredient).toContain('Treat Rough Stripped Wood Into Rough Plank')
    expect(byIngredient).toContain('Saw Rough Stripped Wood')
    expect(byIngredient).not.toContain('Craft Simple Plank')

    const { recipes } = await searchRecipes({ q: 'bark' })
    expect(recipes.map((r) => r.name)).toEqual([
      'Split Rough Wood Trunk into Rough Wood Log Output',
    ])
    // The random output comes with its possibilities, in the game's order
    const possibilities = recipes[0].outputs[0].item.itemList!.possibilities
    expect(possibilities.map((p) => p.probability)).toEqual([0.75, 0.25])
  })

  test('every word must match, ignoring case', async () => {
    expect(await names({ q: 'ROUGH saw' })).toEqual(['Saw Rough Stripped Wood'])
  })

  test('LIKE wildcards in the search are literal', async () => {
    expect(await names({ q: '_' })).toEqual([])
    expect(await names({ q: '%' })).toEqual([])
  })

  test('filters by skill', async () => {
    const list = await names({ skill: 2 })
    expect(list).toContain('Split Rough Wood Trunk into Rough Wood Log Output')
    expect(list).not.toContain('Saw Rough Stripped Wood')
  })

  test('construction recipes are their own list', async () => {
    const list = await names({ kind: 'construction' })
    expect(list).toEqual(['Starter House'])
  })

  test('pages of 50, the page kept inside the list', async () => {
    const skill = await db.skill.findFirstOrThrow()
    await db.recipe.createMany({
      data: Array.from({ length: RECIPES_PER_PAGE + 5 }, (_, i) => ({
        kind: 'crafting' as const,
        gameId: 900_000 + i,
        name: `Craft Filler ${String(i).padStart(3, '0')}`,
        verb: 'Craft',
        actionsRequired: 1,
        timePerAction: 1,
        staminaPerAction: 1,
        skillId: skill.id,
      })),
    })

    const first = await searchRecipes({ q: 'filler' })
    expect(first).toMatchObject({ total: 55, page: 1, lastPage: 2 })
    expect(first.recipes).toHaveLength(RECIPES_PER_PAGE)

    const second = await searchRecipes({ q: 'filler', page: 2 })
    expect(second.recipes.map((r) => r.name)[0]).toBe('Craft Filler 050')
    // A page past the end shows the last one
    expect((await searchRecipes({ q: 'filler', page: 9 })).page).toBe(2)
  })

  test('the filter options come from the active recipes of the tab', async () => {
    const crafting = await filterOptions('crafting')
    expect(crafting.skills.map((s) => s.name)).toContain('Forestry')
    expect(crafting.verbs).toContain('Scrap')
    expect(crafting.tiers.length).toBeGreaterThan(0)

    const construction = await filterOptions('construction')
    expect(construction.verbs).toEqual(['Build'])
    expect(construction.stations).toEqual([])
  })
})
