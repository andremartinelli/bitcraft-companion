import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * Reads the inventories of the registered characters from BitJita's public
 * API. The same sync runs from the "Sincronizar agora" button and on a timer.
 */
export default class InventorySyncCommand extends BaseCommand {
  static commandName = 'inventory:sync'
  static description = 'Sincroniza os inventários dos personagens (API pública da BitJita)'

  static options: CommandOptions = { startApp: true }

  async run() {
    // App code is imported here: ace loads command files before the app boots
    const { default: InventorySync, SyncAlreadyRunningError } =
      await import('#services/game_sync/inventory_sync')
    const { BitJitaInventorySource } = await import('#services/game_sync/inventory_source')

    const source = await this.app.container.make(BitJitaInventorySource)
    let run
    try {
      run = await new InventorySync(source).run('manual')
    } catch (error) {
      if (error instanceof SyncAlreadyRunningError) {
        this.logger.warning(error.message)
        this.exitCode = 1
        return
      }
      throw error
    }

    const counts = run.counts ?? {}
    const summary =
      `Personagens: ${counts.players ?? 0} de ${counts.playersTotal ?? 0} · ` +
      `Claims: ${counts.claims ?? 0} de ${counts.claimsTotal ?? 0} · ` +
      `Locais: ${counts.containers ?? 0} · Itens diferentes por local: ${counts.entries ?? 0}`

    if (run.status === 'ok') this.logger.success(`Sincronização concluída. ${summary}`)
    else if (run.status === 'partial') this.logger.warning(`Sincronização parcial. ${summary}`)
    else this.logger.error(`Sincronização falhou. ${summary}`)

    for (const line of (run.message ?? '').split('\n').filter(Boolean)) {
      this.logger.log(line)
    }
    if (run.status === 'failed') this.exitCode = 1
  }
}
