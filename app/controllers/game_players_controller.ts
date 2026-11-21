import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import GamePlayer from '#models/game_player'
import { BitJitaError } from '#services/game_sync/bitjita_client'
import { BitJitaInventorySource } from '#services/game_sync/inventory_source'
import { createGamePlayerValidator } from '#validators/game_player'

/**
 * The characters whose inventories the app reads. A nick is confirmed on
 * BitJita (public data) before it is saved; no player token is involved.
 */
export default class GamePlayersController {
  async index({ view }: HttpContext) {
    const players = await GamePlayer.query().orderBy('username')
    return view.render('pages/game_players/index', { players })
  }

  @inject()
  async store({ request, response, session }: HttpContext, source: BitJitaInventorySource) {
    const { username } = await request.validateUsing(createGamePlayerValidator)

    let found
    try {
      found = await source.findPlayer(username)
    } catch (error) {
      if (!(error instanceof BitJitaError)) throw error
      session.flashAll()
      session.flash('error', `Não foi possível consultar a BitJita agora: ${error.message}.`)
      return response.redirect().toRoute('game_players.index')
    }

    if (!found) {
      session.flashAll()
      session.flash('error', `Nenhum personagem chamado "${username}" na BitJita.`)
      return response.redirect().toRoute('game_players.index')
    }

    const existing = await GamePlayer.findBy('entityId', found.entityId)
    if (existing) {
      session.flash('error', `${existing.username} já está na lista.`)
      return response.redirect().toRoute('game_players.index')
    }

    await GamePlayer.create({
      username: found.username,
      entityId: found.entityId,
      regionId: found.regionId,
      claims: found.claims,
    })
    session.flash(
      'success',
      `${found.username} adicionado. Sincronize o inventário para ver os itens.`
    )
    return response.redirect().toRoute('game_players.index')
  }

  async destroy({ params, request, response, session }: HttpContext) {
    const player = await GamePlayer.findOrFail(Number(params.id) || 0)
    // Its containers and entries go with it (foreign keys on cascade)
    await player.delete()
    session.flash('success', `${player.username} removido do inventário.`)

    if (request.header('HX-Request')) {
      response.header('HX-Redirect', '/game_players')
      return response.noContent()
    }
    return response.redirect().toRoute('game_players.index')
  }
}
