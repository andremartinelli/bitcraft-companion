import { accountPlayerIds, planPeoplePlayerIds } from '@/models/game_player'
import { onlyMyInventory } from '@/models/plan_user_setting'

/**
 * Whose inventory a page uses (decided 25/11/2026). Outside a plan (the quick
 * calculator, the inventory page, the item's "Você tem"): the account's
 * character. In a plan: also those of the plan's other people, unless the
 * account chose "Usar apenas meu inventário" there. Each character once, even
 * when two people have the same.
 */
export interface InventoryScope {
  playerIds: number[]
  /** The plan's other people have characters: "Usar apenas meu inventário" changes something */
  hasOthers: boolean
  onlyMine: boolean
}

/** The caller checked that the account can open the plan */
export async function inventoryScope(userId: number, planId?: number): Promise<InventoryScope> {
  const [mine, people, onlyMine] = await Promise.all([
    accountPlayerIds(userId),
    planId ? planPeoplePlayerIds(planId, userId) : [],
    planId ? onlyMyInventory(planId, userId) : false,
  ])
  const others = people.filter((id) => !mine.includes(id))
  return {
    playerIds: onlyMine ? mine : [...mine, ...others],
    hasOthers: others.length > 0,
    onlyMine,
  }
}
