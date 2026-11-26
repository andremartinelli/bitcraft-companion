import { countedClaimIds } from '@/models/counted_claim'
import { accountPlayerIds, planPeople } from '@/models/game_player'
import { onlyMyInventory } from '@/models/plan_user_setting'

/**
 * Whose inventory a page uses (decided 25/11/2026). Outside a plan (the quick
 * calculator, the inventory page, the item's "Você tem"): the account's
 * character. In a plan: also those of the plan's other people, unless the
 * account chose "Usar apenas meu inventário" there. Each character once, even
 * when two people have the same.
 *
 * The chests of the claims each of those accounts counts ("Meu personagem")
 * come along with its character (decided 26/11/2026), each claim once.
 */
export interface InventoryScope extends StockOwners {
  /** The account has a character: without one, the page warns (NoCharacterNotice) */
  hasMine: boolean
  /** The plan's other people have characters: "Usar apenas meu inventário" changes something */
  hasOthers: boolean
  onlyMine: boolean
}

/** Whose stock: these characters' places and these claims' chests */
export interface StockOwners {
  playerIds: number[]
  claimIds: string[]
}

/** The caller checked that the account can open the plan */
export async function inventoryScope(userId: number, planId?: number): Promise<InventoryScope> {
  const [mine, people, onlyMine] = await Promise.all([
    accountPlayerIds(userId),
    planId ? planPeople(planId, userId) : [],
    planId ? onlyMyInventory(planId, userId) : false,
  ])
  const others = [...new Set(people.map((person) => person.gamePlayerId))].filter(
    (id) => !mine.includes(id)
  )
  const accounts = onlyMine ? [userId] : [userId, ...people.map((person) => person.id)]
  return {
    playerIds: onlyMine ? mine : [...mine, ...others],
    claimIds: await countedClaimIds(accounts),
    hasMine: mine.length > 0,
    hasOthers: others.length > 0,
    onlyMine,
  }
}
