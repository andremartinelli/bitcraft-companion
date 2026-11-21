import { GameCredentialSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import encryption from '@adonisjs/core/services/encryption'
import User from '#models/user'

/**
 * An app user's own BitCraft token, encrypted with APP_KEY. The encrypted
 * column is never serialized (schema rule) and the token is never rendered.
 */
export default class GameCredential extends GameCredentialSchema {
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  get token(): string | null {
    return encryption.decrypt<string>(this.tokenEncrypted) ?? null
  }

  static async saveFor(
    user: User,
    token: string,
    attributes: { gameUsername?: string | null; identity?: string | null } = {}
  ) {
    return GameCredential.updateOrCreate(
      { userId: user.id },
      { tokenEncrypted: encryption.encrypt(token), lastError: null, ...attributes }
    )
  }
}
