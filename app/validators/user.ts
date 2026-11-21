import vine from '@vinejs/vine'

/**
 * Shared rules for email and password.
 */
const email = () => vine.string().email().maxLength(254)
const password = () => vine.string().minLength(8).maxLength(32)

/**
 * Validator for `node ace users:create`. There is no self-signup:
 * accounts are only created from the command line.
 */
export const createUserValidator = vine.create({
  fullName: vine.string().trim().nullable(),
  email: email().unique({ table: 'users', column: 'email' }),
  password: password(),
})

/**
 * Validator to use before validating user credentials
 * during login
 */
export const loginValidator = vine.create({
  email: email(),
  password: vine.string(),
})
