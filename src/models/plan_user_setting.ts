import { db } from '@/lib/db'

/**
 * What each account chose for itself in a plan (plan_user_settings). It does
 * not change what the plan's other people see.
 */

/** "Usar apenas meu inventário": only the account's character, without the plan's other people */
export async function onlyMyInventory(planId: number, userId: number) {
  const setting = await db.planUserSetting.findUnique({
    where: { planId_userId: { planId, userId } },
    select: { onlyMyInventory: true },
  })
  return setting?.onlyMyInventory ?? false
}

export function saveOnlyMyInventory(planId: number, userId: number, value: boolean) {
  return db.planUserSetting.upsert({
    where: { planId_userId: { planId, userId } },
    create: { planId, userId, onlyMyInventory: value },
    update: { onlyMyInventory: value },
  })
}
