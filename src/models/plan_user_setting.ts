import { db } from '@/lib/db'

/**
 * What each account chose for itself in a plan (plan_user_settings). It does
 * not change what the plan's other people see.
 */

/** "Usar apenas meu inventário", and the people's claims left out of the plan */
export async function planUserSetting(planId: number, userId: number) {
  const setting = await db.planUserSetting.findUnique({
    where: { planId_userId: { planId, userId } },
    select: { onlyMyInventory: true, excludedClaimIds: true },
  })
  return setting ?? { onlyMyInventory: false, excludedClaimIds: [] }
}

export function saveOnlyMyInventory(planId: number, userId: number, value: boolean) {
  return db.planUserSetting.upsert({
    where: { planId_userId: { planId, userId } },
    create: { planId, userId, onlyMyInventory: value },
    update: { onlyMyInventory: value },
  })
}

/** A counted claim of the plan's people is used in the plan, or left out, for this account */
export async function savePlanClaim(
  planId: number,
  userId: number,
  claimEntityId: string,
  used: boolean
) {
  const { excludedClaimIds } = await planUserSetting(planId, userId)
  const others = excludedClaimIds.filter((id) => id !== claimEntityId)
  const excluded = used ? others : [...others, claimEntityId]
  return db.planUserSetting.upsert({
    where: { planId_userId: { planId, userId } },
    create: { planId, userId, excludedClaimIds: excluded },
    update: { excludedClaimIds: excluded },
  })
}
