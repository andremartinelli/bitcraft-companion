import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * Imports the static game data. Safe to re-run after every patch.
 */
export default class BitcraftImport extends BaseCommand {
  static commandName = 'bitcraft:import'
  static description =
    'Importa itens e receitas do BitCraft (repositório BitCraftToolBox/BitCraft_GameData)'

  static options: CommandOptions = { startApp: true }

  @flags.string({ description: 'Commit do repositório de dados (padrão: o mais recente)' })
  declare commit?: string

  @flags.string({ description: 'Pasta local com os JSONs de static/, em vez do GitHub' })
  declare path?: string

  async run() {
    // App code is imported here: ace loads command files before the app boots
    const { default: GameDataImporter } = await import('#services/game_data/importer')
    const { GitHubSource, LocalSource } = await import('#services/game_data/source')

    const source = this.path ? new LocalSource(this.path) : new GitHubSource(this.commit)
    const importer = new GameDataImporter((message) => this.logger.info(message))
    const summary = await importer.run(source)

    const { counts, added, removed, renamed, skipped } = summary
    this.logger.success('Importação concluída')
    this.logger.log(
      `Itens: ${counts.items} · Cargos: ${counts.cargo} · Saídas aleatórias: ${counts.itemLists} · ` +
        `Receitas de craft: ${counts.craftingRecipes} · Construção: ${counts.constructionRecipes} · ` +
        `Pesquisas do assentamento: ${counts.claimTechs}`
    )
    this.logger.log(
      `Novos: ${added.items} itens, ${added.itemLists} listas, ${added.recipes} receitas · ` +
        `Removidos do jogo: ${removed.items} itens, ${removed.itemLists} listas, ${removed.recipes} receitas`
    )
    if (skipped.missingItems || skipped.unknownLookups) {
      this.logger.warning(
        `Referências ignoradas nos dados do jogo: ${skipped.missingItems} a itens inexistentes, ` +
          `${skipped.unknownLookups} a skills/ferramentas/estações desconhecidas`
      )
    }
    for (const change of renamed) {
      this.logger.warning(
        `Renomeado (${change.kind} ${change.gameId}): "${change.from}" → "${change.to}"`
      )
    }
  }
}
