import { findAccountPlayer } from '@/models/game_player'
import { playerTasks, tasksAtTiers, travelers } from '@/models/traveler_task'
import { levelTier } from '@/services/game_data/transform'
import { inventoryScope } from '@/services/inventory/scope'
import { stockTotals } from '@/services/inventory/stock'
import { levelFromXp } from '@/services/tasks/skill_level'

/**
 * The "Tasks" page (decided 26/11/2026): per traveler, the tasks the
 * account's character has now and the ones that can come at its tier in the
 * traveler's skill, each item with how many the account has (its character and
 * counted claims, like the rest of the app outside a plan).
 *
 * Travelers only give tasks of the player's level or below. In a sample of
 * 114 characters × travelers (26/11/2026), 68% had only tasks of the current
 * tier; the others also had tasks one or two tiers below.
 */

export interface TaskLine {
  item: { id: number; name: string; tier: number; rarity: string | null; iconAssetName: string | null }
  quantity: number
  have: number
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
  current: BoardTask[]
  possible: BoardTask[]
}

export async function taskBoard(userId: number) {
  const player = await findAccountPlayer(userId)
  if (!player) return null

  const skills = (player.skills ?? {}) as Record<string, number>
  const all = (await travelers()).map((traveler) => {
    const level = levelFromXp(skills[traveler.skillId] ?? 0)
    return { ...traveler, level, tier: levelTier(level) }
  })
  if (!all.length) return { syncedAt: player.lastSyncedAt, travelers: [] }
  const [current, possible, totals] = await Promise.all([
    playerTasks(player.id),
    tasksAtTiers(all.map(({ skillId, tier }) => ({ skillId, tier }))),
    inventoryScope(userId).then(stockTotals),
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
    })),
  })

  const travelersBoard: TravelerBoard[] = all.map((traveler) => ({
    name: traveler.name,
    skill: traveler.skill,
    level: traveler.level,
    tier: traveler.tier,
    current: current
      .filter((task) => task.skillId === traveler.skillId)
      .map((task) => toBoard(task, task.completed)),
    possible: possible
      .filter((task) => task.skillId === traveler.skillId)
      .map((task) => toBoard(task)),
  }))
  return { syncedAt: player.lastSyncedAt, travelers: travelersBoard }
}
