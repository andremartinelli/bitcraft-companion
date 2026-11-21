import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import { errors as vineErrors } from '@vinejs/vine'
import GamePlayer from '#models/game_player'
import SyncRun, { type SyncStatus } from '#models/sync_run'
import { BitJitaInventorySource } from '#services/game_sync/inventory_source'
import InventorySync, { SyncAlreadyRunningError } from '#services/game_sync/inventory_sync'
import { inventoryListing, type InventoryTab } from '#services/inventory/stock'
import { inventorySearchValidator } from '#validators/inventory'

interface Filters {
  tab: InventoryTab
  q?: string
}

const TABS: { value: InventoryTab; label: string }[] = [
  { value: 'group', label: 'Grupo' },
  { value: 'players', label: 'Por jogador' },
  { value: 'places', label: 'Por local' },
]

const RESULTS: Record<Exclude<SyncStatus, 'running'>, string> = {
  ok: 'Sincronização concluída.',
  partial: 'Sincronização parcial: veja os avisos abaixo.',
  failed: 'A sincronização falhou. Os dados anteriores foram mantidos.',
}

const isHtmx = (request: HttpContext['request']) =>
  Boolean(request.header('HX-Request')) && !request.header('HX-Boosted')

/** Invalid filters fall back to the group tab without a search */
async function readFilters(input: Record<string, unknown>): Promise<Filters> {
  const present = Object.fromEntries(
    Object.entries(input).filter(
      ([, value]) => value !== '' && value !== null && value !== undefined
    )
  )
  try {
    const { tab, q } = await inventorySearchValidator.validate(present)
    return { tab: tab ?? 'group', q: q || undefined }
  } catch (error) {
    if (error instanceof vineErrors.E_VALIDATION_ERROR) return { tab: 'group' }
    throw error
  }
}

/**
 * The group's inventory as of the last sync with BitJita.
 */
export default class InventoryController {
  /**
   * GET /inventory. htmx requests (the item search) get only the list.
   */
  async index({ request, view }: HttpContext) {
    const filters = await readFilters(request.qs())
    if (isHtmx(request)) {
      return view.render('components/inventory/list', await this.#listData(filters))
    }
    return view.render('pages/inventory/index', await this.#panelData(filters, null))
  }

  /**
   * POST /inventory/sync, the "Sincronizar agora" button. htmx redraws the
   * panel; without htmx, back to the page with a flash message.
   */
  @inject()
  async sync({ request, response, view, session }: HttpContext, source: BitJitaInventorySource) {
    const filters = await readFilters(request.only(['tab', 'q']))

    let notice: string
    let ok = false
    try {
      const run = await new InventorySync(source).run('manual')
      notice = RESULTS[run.status as Exclude<SyncStatus, 'running'>]
      ok = run.status === 'ok'
    } catch (error) {
      if (!(error instanceof SyncAlreadyRunningError)) throw error
      notice = error.message
    }

    if (isHtmx(request)) {
      return view.render('components/inventory/panel', await this.#panelData(filters, notice))
    }
    session.flash(ok ? 'success' : 'error', notice)
    return response.redirect().toRoute('inventory.index', [], { qs: this.#query(filters) })
  }

  async #listData(filters: Filters) {
    const listing = await inventoryListing(filters.tab, filters.q)
    return {
      filters,
      listing,
      empty: listing.sections.every((section) => !section.lines.length),
    }
  }

  async #panelData(filters: Filters, notice: string | null) {
    const [latest, lastGood, players] = await Promise.all([
      SyncRun.latest(),
      SyncRun.lastSuccessful(),
      GamePlayer.query().orderBy('username'),
    ])
    return {
      ...(await this.#listData(filters)),
      notice,
      tabs: TABS.map((tab) => ({ ...tab, qs: this.#query({ ...filters, tab: tab.value }) })),
      status: {
        latest,
        // Shown when the last run did not write everything
        lastGood: latest && lastGood && latest.id !== lastGood.id ? lastGood : null,
        notices: (latest?.message ?? '').split('\n').filter(Boolean),
        players,
      },
    }
  }

  #query(filters: Filters) {
    return {
      ...(filters.tab === 'group' ? {} : { tab: filters.tab }),
      ...(filters.q ? { q: filters.q } : {}),
    }
  }
}
