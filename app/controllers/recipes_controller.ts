import type { HttpContext } from '@adonisjs/core/http'

export default class RecipesController {
  /**
   * List recipes. Filled in once the game data models exist.
   */
  async index({ view }: HttpContext) {
    return view.render('pages/recipes/index')
  }
}
