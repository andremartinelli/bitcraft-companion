import { PlanSchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import PlanChoice from '#models/plan_choice'
import PlanItem from '#models/plan_item'
import PlanOwnedItem from '#models/plan_owned_item'
import User from '#models/user'
import type { CalculatorState } from '#services/calculator/production_planner'

/**
 * A saved calculator state with a name, shared by everyone who uses the app.
 */
export default class Plan extends PlanSchema {
  @hasMany(() => PlanItem)
  declare items: HasMany<typeof PlanItem>

  @hasMany(() => PlanChoice)
  declare choices: HasMany<typeof PlanChoice>

  @hasMany(() => PlanOwnedItem)
  declare ownedItems: HasMany<typeof PlanOwnedItem>

  @belongsTo(() => User, { foreignKey: 'createdById' })
  declare createdBy: BelongsTo<typeof User>

  @belongsTo(() => User, { foreignKey: 'updatedById' })
  declare updatedBy: BelongsTo<typeof User>

  /** Needs items, choices and ownedItems preloaded */
  toCalculatorState(): CalculatorState {
    const choices: CalculatorState['choices'] = {}
    for (const choice of this.choices) choices[choice.itemId] = choice.recipeId ?? 'raw'
    const owned: CalculatorState['owned'] = {}
    for (const entry of this.ownedItems) owned[entry.itemId] = entry.quantity

    return {
      targets: this.items.map((item) => ({ itemId: item.itemId, quantity: item.quantity })),
      choices,
      owned,
      useInventory: this.useInventory,
    }
  }

  /**
   * Replaces the plan's targets, choices and owned quantities in one
   * transaction. Repeated targets are merged.
   */
  async saveState(state: CalculatorState, user: User) {
    const targets = new Map<number, number>()
    for (const t of state.targets) targets.set(t.itemId, (targets.get(t.itemId) ?? 0) + t.quantity)

    await db.transaction(async (trx) => {
      for (const table of ['plan_items', 'plan_choices', 'plan_owned_items']) {
        await trx.from(table).where('plan_id', this.id).delete()
      }
      let position = 0
      const items = [...targets].map(([itemId, quantity]) => ({
        plan_id: this.id,
        item_id: itemId,
        quantity,
        position: position++,
      }))
      const choices = Object.entries(state.choices).map(([itemId, choice]) => ({
        plan_id: this.id,
        item_id: Number(itemId),
        recipe_id: choice === 'raw' ? null : choice,
      }))
      const owned = Object.entries(state.owned).map(([itemId, quantity]) => ({
        plan_id: this.id,
        item_id: Number(itemId),
        quantity,
      }))
      if (items.length) await trx.insertQuery().table('plan_items').multiInsert(items)
      if (choices.length) await trx.insertQuery().table('plan_choices').multiInsert(choices)
      if (owned.length) await trx.insertQuery().table('plan_owned_items').multiInsert(owned)

      this.useTransaction(trx)
      if (state.useInventory !== undefined) this.useInventory = state.useInventory
      this.updatedById = user.id
      // touch updated_at even when only the state changed
      this.updatedAt = DateTime.now()
      await this.save()
    })
  }
}
