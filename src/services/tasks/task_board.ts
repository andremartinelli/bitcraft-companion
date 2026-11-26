import { accountPlayerIds, findAccountPlayer } from '@/models/game_player'
import { playerTasks, tasksAtTiers, travelers, unlockedTaskTiers } from '@/models/traveler_task'
import { levelTier } from '@/services/game_data/transform'
import { taskInventoryScope } from '@/services/inventory/scope'
import type { ItemHolder } from '@/services/inventory/professions'
import { holdersByItem, stockTotals } from '@/services/inventory/stock'
import { levelFromXp } from '@/services/tasks/skill_level'

/**
 * The "Tasks" page (decided 26/11/2026): per traveler, the tasks the
 * account's character has now and the ones that can come at its tier in the
 * traveler's skill (up to its level), each item with how many the account has
 * in the inventories it ticks in "Inventários" (services/inventory/scope:
 * taskInventoryScope).
 *
 * The tier is the one the character's quests unlocked, not its level's: "The
 * Best Ingredients (I)" (Cooking 20) unlocks Heimlich's T2, and so on up to
 * T10. In a sample of 60 characters (26/11/2026), no task was above the
 * unlocked tier, 79% of characters × travelers had only tasks of that tier and
 * the others also had some below it; the level's tier was too high for 54%.
 * Hunting (Ramparte) has no tiers: each creature's tasks take its own quest,
 * which the game data does not tie to the tasks, so it goes by the level.
 */

export interface TaskLine {
  item: {
    id: number
    name: string
    tier: number
    rarity: string | null
    iconAssetName: string | null
  }
  quantity: number
  have: number
  /** Who has it and how many, the most first, as the plan's "Coletar" shows */
  holders: ItemHolder[]
}

export interface BoardTask {
  id: number
  tier: number
  description: string
  completed: boolean
  lines: TaskLine[]
}

export interface TravelerBoard {
  name: string
  skill: string
  level: number
  tier: number
  /** False: no quest unlocks this traveler's tiers (Ramparte), so the tier is the level's */
  tierFromQuests: boolean
  current: BoardTask[]
  possible: BoardTask[]
}

/**
 * The characters the Tasks page reads on BitJita: the account's own (its tasks
 * and quests), even when left out of "você tem", and the ones ticked there
 */
export async function taskSyncPlayerIds(userId: number) {
  const [mine, scope] = await Promise.all([accountPlayerIds(userId), taskInventoryScope(userId)])
  return [...new Set([...mine, ...scope.playerIds])]
}

export async function taskBoard(userId: number) {
  const player = await findAccountPlayer(userId)
  if (!player) return null

  const skills = (player.skills ?? {}) as Record<string, number>
  const unlocked = await unlockedTaskTiers(player.completedQuestChainIds)
  const all = (await travelers()).map((traveler) => {
    const level = levelFromXp(skills[traveler.skillId] ?? 0)
    const fromQuests = unlocked.get(traveler.skillId)
    return {
      ...traveler,
      level,
      tier: fromQuests ?? levelTier(level),
      tierFromQuests: fromQuests !== undefined,
    }
  })
  // Whose inventory "você tem" counts: the account's "Inventários" menu
  const scope = await taskInventoryScope(userId)
  if (!all.length) return { syncedAt: player.lastSyncedAt, travelers: [], scope }
  const [current, possible, totals, holders] = await Promise.all([
    playerTasks(player.id),
    tasksAtTiers(all.map(({ skillId, tier, level }) => ({ skillId, tier, level }))),
    stockTotals(scope),
    holdersByItem(scope),
  ])

  type Task = (typeof possible)[number]
  const toBoard = (task: Task, completed = false): BoardTask => ({
    id: task.id,
    tier: task.tier,
    description: task.description,
    completed,
    lines: task.inputs.map(({ item, quantity }) => ({
      item,
      quantity,
      have: totals.get(item.id) ?? 0,
      holders: holders.get(item.id) ?? [],
    })),
  })

  const travelersBoard: TravelerBoard[] = all.map((traveler) => ({
    name: traveler.name,
    skill: traveler.skill,
    level: traveler.level,
    tier: traveler.tier,
    tierFromQuests: traveler.tierFromQuests,
    current: current
      .filter((task) => task.skillId === traveler.skillId)
      .map((task) => toBoard(task, task.completed)),
    possible: possible
      .filter((task) => task.skillId === traveler.skillId)
      .map((task) => toBoard(task)),
  }))
  return { syncedAt: player.lastSyncedAt, travelers: travelersBoard, scope }
}
