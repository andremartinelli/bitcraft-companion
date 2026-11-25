import { beforeEach, describe, expect, test, vi } from 'vitest'

// The session cookie of the request
const request = vi.hoisted(() => ({ token: undefined as string | undefined }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'session' && request.token ? { value: request.token } : undefined,
  }),
}))

import { updateRecipeChoice } from '@/app/(app)/recipe_choices/actions'
import { db } from '@/lib/db'
import { recipeChoicesOf } from '@/models/user_recipe_choice'
import { createUser } from '@/services/auth/create_user'
import { createSessionToken } from '@/services/auth/session_token'
import { importTables, withSecondStrippedWoodRecipe } from '../../helpers/game_data'

describe('recipe choice actions', () => {
  let userId: number
  let stripped: number
  let carve: number

  beforeEach(async () => {
    await importTables(withSecondStrippedWoodRecipe())
    const user = await createUser({
      email: 'vitor@example.com',
      fullName: 'Vitor',
      password: 'a-long-enough-password',
    })
    userId = user.id
    request.token = await createSessionToken(user.id)
    stripped = (
      await db.item.findUniqueOrThrow({ where: { kind_gameId: { kind: 'item', gameId: 1020 } } })
    ).id
    carve = (
      await db.recipe.findUniqueOrThrow({
        where: { kind_gameId: { kind: 'crafting', gameId: 106 } },
      })
    ).id
  })

  test('asks for the login first', async () => {
    request.token = undefined
    const error = await updateRecipeChoice({ itemId: stripped, recipeId: carve }).catch(
      (e: { digest?: string }) => e
    )
    expect(String((error as { digest?: string }).digest)).toContain('/login')
    expect(await db.userRecipeChoice.count()).toBe(0)
  })

  test('the recipe picked becomes the account default', async () => {
    expect(await updateRecipeChoice({ itemId: stripped, recipeId: carve })).toEqual({ saved: true })
    expect(await recipeChoicesOf(userId)).toEqual({ [stripped]: carve })
  })

  test('invalid input saves nothing', async () => {
    expect(await updateRecipeChoice({ itemId: stripped, recipeId: 'raw' })).toEqual({
      saved: false,
    })
    expect(await updateRecipeChoice(null)).toEqual({ saved: false })
    expect(await db.userRecipeChoice.count()).toBe(0)
  })
})
