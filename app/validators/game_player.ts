import vine, { SimpleMessagesProvider } from '@vinejs/vine'

/**
 * POST /game_players: the character's nick, confirmed on BitJita before saving.
 */
export const createGamePlayerValidator = vine.create({
  username: vine.string().trim().minLength(2).maxLength(40),
})

createGamePlayerValidator.messagesProvider = new SimpleMessagesProvider({
  'username.required': 'Informe o nick do personagem.',
  'username.minLength': 'O nick tem pelo menos 2 letras.',
  'username.maxLength': 'O nick tem no máximo 40 letras.',
})
