import { z } from 'zod'

const id = z.number().int().positive().max(2_147_483_647)

/** PUT /recipe_choices: the recipe picked for an item */
export const recipeChoiceSchema = z.object({ itemId: id, recipeId: id })
