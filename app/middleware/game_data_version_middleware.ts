import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import GameDataImport from '#models/game_data_import'

/**
 * Shares the latest finished import with the views, so the layout can say
 * which game data the app is showing.
 */
export default class GameDataVersionMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const gameData = await GameDataImport.query()
      .whereNotNull('finished_at')
      .orderBy('id', 'desc')
      .first()
    ctx.view.share({ gameData })
    return next()
  }
}
