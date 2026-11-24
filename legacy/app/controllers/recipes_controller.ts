import type { HttpContext } from '@adonisjs/core/http'
import Recipe from '#models/recipe'
import { recipeSearchValidator } from '#validators/recipe'

const PER_PAGE = 50

export default class RecipesController {
  /**
   * GET /recipes. An htmx request (filters, pagination) gets only the list.
   */
  async index({ request, view }: HttpContext) {
    const query = Object.fromEntries(
      Object.entries(request.qs()).filter(([, value]) => value !== '' && value !== null)
    )
    const filters = await recipeSearchValidator.validate(query)
    const kind = filters.kind ?? 'crafting'

    const recipes = await Recipe.query()
      .withScopes((s) => {
        s.active()
        s.search(filters)
        s.withDetails()
      })
      .paginate(filters.page ?? 1, PER_PAGE)

    const listQuery = { ...query }
    delete listQuery.page
    recipes.baseUrl('/recipes').queryString(listQuery)

    const state = { recipes, filters: { ...filters, kind } }
    if (request.header('HX-Request') && !request.header('HX-Boosted')) {
      return view.render('components/recipes/list', state)
    }

    return view.render('pages/recipes/index', {
      ...state,
      options: await Recipe.filterOptions(kind),
    })
  }
}
