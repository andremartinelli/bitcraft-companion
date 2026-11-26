import { excludedBuildingIds } from '@/models/claim_building_choice'
import { countedClaims } from '@/models/counted_claim'
import {
  accountPlayerIds,
  groupPeoplePlayerIds,
  planPeople,
  playerNames,
} from '@/models/game_player'
import { planUserSetting } from '@/models/plan_user_setting'
import { taskInventorySetting } from '@/models/task_inventory_setting'

/**
 * Whose inventory a page uses (decided 25/11/2026). Outside a plan (the quick
 * calculator, the inventory page, the item's "Você tem"): the account's
 * character. In a plan: also those of the plan's other people. Each character
 * once, even when two people have the same.
 *
 * The chests of the claims each of those accounts counts ("Meu personagem")
 * come along with its character, each claim once (decided 26/11/2026). Of
 * those chests, only the kinds of building this account counts
 * (models/claim_building_choice).
 *
 * In a plan and on the Tasks page, the "Inventários" menu lists the characters
 * and claims, and each account leaves some out for itself (decided 26/11/2026).
 */
export interface InventoryScope extends StockOwners {
  /** The "Inventários" menu: empty outside a plan */
  people: ScopePerson[]
  claims: ScopeClaim[]
  /** The account has a character: without one, the page warns (NoCharacterNotice) */
  hasMine: boolean
}

/** Whose stock: these characters' places and these claims' chests */
export interface StockOwners {
  playerIds: number[]
  claimIds: string[]
  /** Claim chests of these kinds of building (buildings.id) stay out */
  excludedBuildingIds?: number[]
}

/** A character of the menu, and whether this account counts it */
export interface ScopePerson {
  gamePlayerId: number
  name: string
  mine: boolean
  used: boolean
}

/** A counted claim of the menu, and whether this account counts it */
export interface ScopeClaim {
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
  const characters = [...new Set([...mine, ...people.map((person) => person.gamePlayerId)])]
  const claims = await countedClaims([userId, ...people.map((person) => person.id)])
  return scopeOf({
    userId,
    menu: planId !== undefined,
    characters,
    mine,
    isUsed: (id) => !setting?.excludedGamePlayerIds.includes(id),
    claims,
    isClaimUsed: (id) => !setting?.excludedClaimIds.includes(id),
  })
}

/**
 * The Tasks page's "você tem" (decided 26/11/2026): my character unless I
 * leave it out, the characters of people of my groups I tick (only their
 * character: their claims don't come along) and my counted claims unless I
 * leave them out. A person who left my groups stops counting.
 */
export async function taskInventoryScope(userId: number): Promise<InventoryScope> {
  const [mine, others, setting, claims] = await Promise.all([
    accountPlayerIds(userId),
    groupPeoplePlayerIds(userId),
    taskInventorySetting(userId),
    countedClaims([userId]),
  ])
  return scopeOf({
    userId,
    menu: true,
    characters: [...new Set([...mine, ...others])],
    mine,
    isUsed: (id) => (mine.includes(id) ? !setting.withoutMine : setting.gamePlayerIds.includes(id)),
    claims,
    isClaimUsed: (id) => !setting.excludedClaimIds.includes(id),
  })
}

async function scopeOf(input: {
  userId: number
  menu: boolean
  characters: number[]
  mine: number[]
  isUsed: (gamePlayerId: number) => boolean
  claims: { entityId: string; name: string }[]
  isClaimUsed: (entityId: string) => boolean
}): Promise<InventoryScope> {
  const { userId, menu, characters, mine } = input
  const people = (await playerNames(characters)).map((person) => ({
    ...person,
    mine: mine.includes(person.gamePlayerId),
    used: input.isUsed(person.gamePlayerId),
  }))
  const claims = input.claims.map((claim) => ({
    ...claim,
    used: input.isClaimUsed(claim.entityId),
  }))
  const claimIds = claims.filter((claim) => claim.used).map((claim) => claim.entityId)
  return {
    playerIds: people.filter((person) => person.used).map((person) => person.gamePlayerId),
    claimIds,
    excludedBuildingIds: await excludedBuildingIds(userId, claimIds),
    people: menu ? people : [],
    claims: menu ? claims : [],
    hasMine: mine.length > 0,
  }
}

/** The character or claim of this choice is in the scope's menu */
export function inMenu(
  scope: InventoryScope,
  choice: { gamePlayerId: number } | { claimEntityId: string }
) {
  return 'gamePlayerId' in choice
    ? scope.people.some((person) => person.gamePlayerId === choice.gamePlayerId)
    : scope.claims.some((claim) => claim.entityId === choice.claimEntityId)
}
