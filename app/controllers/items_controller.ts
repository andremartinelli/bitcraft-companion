import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import Item from '#models/item'

const searchValidator = vine.create({ q: vine.string().trim().maxLength(100).optional() })

export default class ItemsController {
  /**
   * GET /items?q=. Item search; htmx requests (the calculator's item picker)
   * get only the suggestions.
   */
  async index({ request, view }: HttpContext) {
    const { q } = await searchValidator.validate(request.qs())
    const words = (q ?? '').toLowerCase().split(/\s+/).filter(Boolean)

    const items =
      words.length && (q ?? '').length >= 2
        ? await Item.query()
            .withScopes((s) => s.active())
            .where((query) => {
              for (const word of words) {
                query.whereRaw(`items.name LIKE ? ESCAPE '\\'`, [
                  `%${word.replace(/[%_\\]/g, '\\$&')}%`,
                ])
              }
            })
            .orderByRaw('length(items.name)')
            .orderBy('items.tier')
            .limit(20)
        : []

    if (request.header('HX-Request')) {
      return view.render('components/calculator/suggestions', { items, q })
    }
    return view.render('pages/items/index', { items, q })
  }

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
