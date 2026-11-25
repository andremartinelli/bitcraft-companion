import { beforeEach, describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import { findPlan, insertPlan, toCalculatorState } from '@/models/plan'
import { recipeChoicesOf, saveRecipeChoice, withRecipeChoices } from '@/models/user_recipe_choice'
import { createUser } from '@/services/auth/create_user'
import { emptyState } from '@/services/calculator/state_params'
import { importTables, withSecondStrippedWoodRecipe } from '../../helpers/game_data'

const itemId = async (gameId: number) =>
  (await db.item.findUniqueOrThrow({ where: { kind_gameId: { kind: 'item', gameId } } })).id
const recipeId = async (gameId: number) =>
  (await db.recipe.findUniqueOrThrow({ where: { kind_gameId: { kind: 'crafting', gameId } } })).id
const loaded = async (id: number) => toCalculatorState((await findPlan(id))!)

describe('the recipe each account picked per item', () => {
  let userId: number
  let plank: number
  let stripped: number
  let saw: number
  let carve: number

  beforeEach(async () => {
    await importTables(withSecondStrippedWoodRecipe())
    const user = await createUser({
      email: 'vitor@example.com',
      fullName: 'Vitor',
      password: 'a-long-enough-password',
    })
    userId = user.id
    plank = await itemId(1030)
    stripped = await itemId(1020)
    saw = await recipeId(101)
    carve = await recipeId(106)
  })

  const plankState = () => ({ ...emptyState(), targets: [{ itemId: plank, quantity: 10 }] })

  test('the last recipe picked for an item is the default, per account', async () => {
    expect(await saveRecipeChoice(userId, stripped, carve)).toBe(true)
    expect(await saveRecipeChoice(userId, stripped, saw)).toBe(true)

    expect(await recipeChoicesOf(userId)).toEqual({ [stripped]: saw })
    const other = await createUser({ email: 'ana@example.com', password: 'a-long-enough-password' })
    expect(await recipeChoicesOf(other.id)).toEqual({})
  })

  test('a recipe that does not make the item saves nothing', async () => {
    expect(await saveRecipeChoice(userId, plank, carve)).toBe(false)
    expect(await recipeChoicesOf(userId)).toEqual({})
  })

  test('a new plan starts with them and keeps its own afterwards', async () => {
    await saveRecipeChoice(userId, stripped, carve)

    const plan = await insertPlan({ name: 'Pranchas', userId, state: plankState() })
    expect((await loaded(plan.id)).choices).toEqual({ [stripped]: carve })
    // What the state chose wins
    const own = await insertPlan({
      name: 'Pranchas compradas',
      userId,
      state: { ...plankState(), choices: { [stripped]: 'raw' } },
    })
    expect((await loaded(own.id)).choices).toEqual({ [stripped]: 'raw' })

    // A new default changes no plan
    await saveRecipeChoice(userId, stripped, saw)
    expect((await loaded(plan.id)).choices).toEqual({ [stripped]: carve })
  })

  test('the quick calculator uses them where its URL chose nothing', async () => {
    await saveRecipeChoice(userId, stripped, carve)

    expect((await withRecipeChoices(plankState(), userId)).choices).toEqual({ [stripped]: carve })
    const chosen = { ...plankState(), choices: { [stripped]: saw } }
    expect((await withRecipeChoices(chosen, userId)).choices).toEqual({ [stripped]: saw })
  })
})
