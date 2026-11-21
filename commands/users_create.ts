import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { errors } from '@vinejs/vine'
import User from '#models/user'
import { createUserValidator } from '#validators/user'

/**
 * There is no self-signup: the two accounts are created here.
 */
export default class UsersCreate extends BaseCommand {
  static commandName = 'users:create'
  static description = 'Cria uma conta de acesso ao app'

  static options: CommandOptions = { startApp: true }

  @flags.string({ description: 'E-mail usado para entrar' })
  declare email?: string

  @flags.string({ description: 'Nome exibido no app' })
  declare name?: string

  @flags.string({ description: 'Senha (8 a 32 caracteres). Sem ela, é pedida de forma oculta.' })
  declare password?: string

  async run() {
    const email = this.email ?? (await this.prompt.ask('E-mail'))
    const fullName = this.name ?? null
    const password = this.password ?? (await this.prompt.secure('Senha'))

    try {
      const data = await createUserValidator.validate({ email, fullName, password })
      const user = await User.create(data)
      this.logger.success(`Conta criada: ${user.email}`)
    } catch (error) {
      if (error instanceof errors.E_VALIDATION_ERROR) {
        for (const message of error.messages)
          this.logger.error(`${message.field}: ${message.message}`)
        this.exitCode = 1
        return
      }
      throw error
    }
  }
}
