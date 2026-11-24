import vine from '@vinejs/vine'

/**
 * The plan name. The calculator state of a plan is read with readState(),
 * like the quick calculator.
 */
export const planNameValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(80),
})
