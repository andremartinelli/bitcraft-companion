import { countedClaims } from '@/models/counted_claim'
import { accountPlayerIds, planPeople } from '@/models/game_player'
import { planUserSetting } from '@/models/plan_user_setting'

/**
 * Whose inventory a page uses (decided 25/11/2026). Outside a plan (the quick
 * calculator, the inventory page, the item's "Você tem"): the account's
 * character. In a plan: also those of the plan's other people, unless the
 * account chose "Usar apenas meu inventário" there. Each character once, even
 * when two people have the same.
 *
 * The chests of the claims each of those accounts counts ("Meu personagem")
 * come along with its character, each claim once; in a plan, each account can
 * leave some out for itself (decided 26/11/2026).
 */
export interface InventoryScope extends StockOwners {
  /** In a plan: the claims its people count, and whether this account uses each one there */
  planClaims: PlanClaim[]
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

export interface PlanClaim {
  entityId: string
  name: string
  used: boolean
}

/** The caller checked that the account can open the plan */
export async function inventoryScope(userId: number, planId?: number): Promise<InventoryScope> {
  const [mine, people, setting] = await Promise.all([
    accountPlayerIds(userId),
    planId ? planPeople(planId, userId) : [],
    planId ? planUserSetting(planId, userId) : null,
  ])
  const onlyMine = setting?.onlyMyInventory ?? false
  const others = [...new Set(people.map((person) => person.gamePlayerId))].filter(
    (id) => !mine.includes(id)
  )
  const accounts = onlyMine ? [userId] : [userId, ...people.map((person) => person.id)]
  const claims = (await countedClaims(accounts)).map((claim) => ({
    ...claim,
    used: !setting?.excludedClaimIds.includes(claim.entityId),
  }))
  return {
    playerIds: onlyMine ? mine : [...mine, ...others],
    claimIds: claims.filter((claim) => claim.used).map((claim) => claim.entityId),
    planClaims: planId ? claims : [],
    hasMine: mine.length > 0,
    hasOthers: others.length > 0,
    onlyMine,
  }
}
