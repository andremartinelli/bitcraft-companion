import type { HttpContext } from '@adonisjs/core/http'
import Item from '#models/item'

export default class ItemsController {
  /**
   * GET /items/:id. Removed items answer 404.
   */
  async show({ params, view }: HttpContext) {
    const item = await Item.query()
      .withScopes((s) => s.active())
      .where('id', Number(params.id) || 0)
      .firstOrFail()

    const [producers, consumers] = await Promise.all([
      item.producingRecipes(),
      item.consumingRecipes(),
    ])

    return view.render('pages/items/show', { item, producers, consumers })
  }
}
