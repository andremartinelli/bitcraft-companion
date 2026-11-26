import { db } from '@/lib/db'

/**
 * What each account chose for itself in a plan (plan_user_settings), in its
 * "Inventários" menu. It does not change what the plan's other people see.
 */

/** The characters and counted claims of the plan's people this account leaves out */
export async function planUserSetting(planId: number, userId: number) {
  const setting = await db.planUserSetting.findUnique({
    where: { planId_userId: { planId, userId } },
    select: { excludedGamePlayerIds: true, excludedClaimIds: true },
  })
  return setting ?? { excludedGamePlayerIds: [], excludedClaimIds: [] }
}

/** A character or claim of the plan's people is used in the plan, or left out, for this account */
export async function savePlanInventoryChoice(
  planId: number,
  userId: number,
  choice: InventoryChoice
) {
  const setting = await planUserSetting(planId, userId)
  const data =
    'gamePlayerId' in choice
      ? {
          excludedGamePlayerIds: toggled(
            setting.excludedGamePlayerIds,
            choice.gamePlayerId,
            !choice.used
          ),
        }
      : { excludedClaimIds: toggled(setting.excludedClaimIds, choice.claimEntityId, !choice.used) }
  return db.planUserSetting.upsert({
    where: { planId_userId: { planId, userId } },
    create: { planId, userId, ...data },
    update: data,
  })
}

export type InventoryChoice =
  { gamePlayerId: number; used: boolean } | { claimEntityId: string; used: boolean }

/** The list with or without this value, once */
export function toggled<T>(list: T[], value: T, on: boolean) {
  const others = list.filter((item) => item !== value)
  return on ? [...others, value] : others
}
