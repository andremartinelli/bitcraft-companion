import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import Item from '#models/item'
import SyncRun from '#models/sync_run'
import { itemStock } from '#services/inventory/stock'

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
            // Craftable items first: the same name often exists as the craft
            // result (random rarity) and as each rarity, which only drops
            .orderByRaw(
              `exists (select 1 from recipe_outputs ro join recipes r on r.id = ro.recipe_id
                where ro.item_id = items.id and r.removed_at is null and r.verb not in ('Scrap', 'Recraft', 'Unpack', 'Package')) desc`
            )
            .orderByRaw('length(items.name)')
            .orderBy('items.tier')
            .orderBy('items.id')
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

    const [producers, consumers, synced] = await Promise.all([
      item.producingRecipes(),
      item.consumingRecipes(),
      SyncRun.lastSuccessful(),
    ])
    // "Vocês têm: N" only once the inventory was read at least once
    const stock = synced ? await itemStock(item.id) : null

    return view.render('pages/items/show', { item, producers, consumers, stock })
  }
}
