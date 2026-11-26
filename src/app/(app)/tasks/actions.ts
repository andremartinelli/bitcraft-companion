'use server'

import { refresh } from 'next/cache'
import { requireUser } from '@/lib/session'
import { saveTaskInventoryChoice } from '@/models/task_inventory_setting'
import { inMenu, taskInventoryScope } from '@/services/inventory/scope'
import { inventoryChoiceSchema } from '@/validators/inventory'

/**
 * PATCH /tasks/inventory: whether a character (mine, or of people of my
 * groups) or one of my counted claims counts in the Tasks page's "você tem"
 */
export async function updateTaskInventory(input: unknown) {
  const user = await requireUser()
  const choice = inventoryChoiceSchema.safeParse(input)
  if (choice.success) {
    const scope = await taskInventoryScope(user.id)
    const { data } = choice
    if (inMenu(scope, data)) {
      const mine = scope.people.some(
        (person) =>
          person.mine && 'gamePlayerId' in data && person.gamePlayerId === data.gamePlayerId
      )
      await saveTaskInventoryChoice(user.id, data, mine)
    }
  }
  refresh()
}
