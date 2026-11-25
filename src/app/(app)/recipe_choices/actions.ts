'use server'

import { requireUser } from '@/lib/session'
import { saveRecipeChoice } from '@/models/user_recipe_choice'
import { recipeChoiceSchema } from '@/validators/recipe_choice'

/**
 * PUT /recipe_choices: the recipe picked in a calculation becomes the
 * account's default for that item. Nothing to show: the calculation already
 * has the choice, and a recipe that does not make the item saves nothing.
 */
export async function updateRecipeChoice(input: unknown): Promise<{ saved: boolean }> {
  const user = await requireUser()
  const parsed = recipeChoiceSchema.safeParse(input)
  if (!parsed.success) return { saved: false }
  return { saved: await saveRecipeChoice(user.id, parsed.data.itemId, parsed.data.recipeId) }
}
