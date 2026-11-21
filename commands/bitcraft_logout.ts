import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class BitcraftLogout extends BaseCommand {
  static commandName = 'bitcraft:logout'
  static description = 'Apaga o token do BitCraft guardado para uma conta do app'

  static options: CommandOptions = { startApp: true }

  @flags.string({ description: 'E-mail da conta no app', required: true })
  declare user: string

  async run() {
    const { default: User } = await import('#models/user')
    const { default: GameCredential } = await import('#models/game_credential')

    const user = await User.findBy('email', this.user)
    const deleted = user ? await GameCredential.query().where('user_id', user.id).delete() : [0]
    if (Number(deleted[0]) > 0) this.logger.success('Token apagado.')
    else this.logger.info('Não havia token guardado para essa conta.')
  }
}
