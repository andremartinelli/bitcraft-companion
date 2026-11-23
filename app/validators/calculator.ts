import vine from '@vinejs/vine'

/**
 * The calculator state, as it comes from the query string or a plan form.
 * Field names use brackets: targets[0][item_id], choices[i123], owned[i123].
 */
export const calculatorStateValidator = vine.create({
  targets: vine
    .array(
      vine.object({
        item_id: vine.number().withoutDecimals().positive(),
        quantity: vine.number().withoutDecimals().min(1).max(100_000).optional(),
      })
    )
    .maxLength(30)
    .optional(),
  // Buildings to build (construction recipes): buildings[0][recipe_id]
  buildings: vine
    .array(
      vine.object({
        recipe_id: vine.number().withoutDecimals().positive(),
        quantity: vine.number().withoutDecimals().min(1).max(1_000).optional(),
      })
    )
    .maxLength(30)
    .optional(),
  choices: vine.record(vine.string().regex(/^(raw|\d+)$/)).optional(),
  owned: vine.record(vine.number().withoutDecimals().min(0).max(1_000_000)).optional(),
  // "Usar inventário do grupo": "0" turns it off; absent or "1" leaves it on
  inventory: vine.enum(['0', '1'] as const).optional(),
  // Buttons of the form: add an item from the search, remove a target by position
  add: vine.number().withoutDecimals().positive().optional(),
  remove: vine.number().withoutDecimals().min(0).optional(),
  // The same for buildings: a construction recipe id, a position
  add_building: vine.number().withoutDecimals().positive().optional(),
  remove_building: vine.number().withoutDecimals().min(0).optional(),
})
