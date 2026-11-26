import { db } from '@/lib/db'
import { type InventoryChoice, toggled } from '@/models/plan_user_setting'

/**
 * Whose inventory counts in "você tem" on the Tasks page (task_inventory_settings,
 * decided 26/11/2026), per account: its character unless left out, the
 * characters of people of its groups it ticks (not their claims) and its own
 * counted claims unless left out.
 */
export async function taskInventorySetting(userId: number) {
  const setting = await db.taskInventorySetting.findUnique({
    where: { userId },
    select: { withoutMine: true, gamePlayerIds: true, excludedClaimIds: true },
  })
  return setting ?? { withoutMine: false, gamePlayerIds: [], excludedClaimIds: [] }
}

/** The caller checked that the character or claim is in the account's menu, and whether the character is its own */
export async function saveTaskInventoryChoice(
  userId: number,
  choice: InventoryChoice,
  mine: boolean
) {
  const setting = await taskInventorySetting(userId)
  const data =
    'claimEntityId' in choice
      ? { excludedClaimIds: toggled(setting.excludedClaimIds, choice.claimEntityId, !choice.used) }
      : mine
        ? { withoutMine: !choice.used }
        : { gamePlayerIds: toggled(setting.gamePlayerIds, choice.gamePlayerId, choice.used) }
  return db.taskInventorySetting.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  })
}
