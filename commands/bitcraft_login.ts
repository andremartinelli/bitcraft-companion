import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * Connects an app account to its own BitCraft account (e-mail + access code).
 * The token is stored encrypted and never printed.
 */
export default class BitcraftLogin extends BaseCommand {
  static commandName = 'bitcraft:login'
  static description = 'Conecta uma conta do app à própria conta do BitCraft (código por e-mail)'

  static options: CommandOptions = { startApp: true }

  @flags.string({
    description: 'E-mail da conta no app (padrão: o único usuário, se houver só um)',
  })
  declare user?: string

  @flags.string({ description: 'E-mail da conta do BitCraft' })
  declare email?: string

  async run() {
    const { default: User } = await import('#models/user')
    const { default: GameCredential } = await import('#models/game_credential')
    const { requestCode, authenticate, tokenClaims, GameAuthError } =
      await import('#services/game_sync/game_auth')

    const firstUsers = await User.query().limit(2)
    const user = this.user
      ? await User.findBy('email', this.user)
      : firstUsers.length === 1
        ? firstUsers[0]
        : null
    if (!user) {
      this.logger.error('Informe a conta do app com --user=<e-mail> (ela precisa existir).')
      this.exitCode = 1
      return
    }

    const email = (
      this.email ??
      (await this.prompt.ask('E-mail da sua conta do BitCraft')) ??
      ''
    ).trim()
    if (!email) {
      this.logger.error('Informe o e-mail da conta do BitCraft.')
      this.exitCode = 1
      return
    }
    try {
      await requestCode(email)
      this.logger.info('Código enviado. Confira o e-mail da conta do BitCraft.')
      const code = ((await this.prompt.secure('Código recebido')) ?? '').trim()
      const token = await authenticate(email, code)

      const claims = tokenClaims(token)
      const identity =
        typeof claims.hex_identity === 'string'
          ? claims.hex_identity
          : typeof claims.identity === 'string'
            ? claims.identity
            : null
      await GameCredential.saveFor(user, token, { identity })

      this.logger.success(`Conta do BitCraft conectada para ${user.email}.`)
      this.logger.log(
        `Campos do token: ${Object.keys(claims).join(', ') || '(não é um JWT legível)'}`
      )
      this.logger.log(
        identity ? `Identity: ${identity.slice(0, 10)}…` : 'Identity: não encontrada no token'
      )
    } catch (error) {
      if (error instanceof GameAuthError) {
        this.logger.error(error.message)
        this.exitCode = 1
        return
      }
      throw error
    }
  }
}
