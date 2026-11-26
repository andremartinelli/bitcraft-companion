import { db } from '@/lib/db'

/**
 * Travelers' tasks (traveler_tasks, from the game data) and the ones each
 * character has now (game_player_tasks, from BitJita). Not quests.
 */

const ITEM = { select: { id: true, name: true, tier: true, rarity: true, iconAssetName: true } }
const TASK = {
  id: true,
  traveler: true,
  skillId: true,
  tier: true,
  description: true,
  inputs: { select: { quantity: true, item: ITEM }, orderBy: { id: 'asc' as const } },
}

/** The travelers who give tasks, each with the skill they give XP in */
export async function travelers() {
  const rows = await db.travelerTask.findMany({
    where: { removedAt: null, traveler: { not: null } },
    distinct: ['skillId'],
    orderBy: { traveler: 'asc' },
    select: { traveler: true, skillId: true, skill: { select: { name: true } } },
  })
  return rows.map((row) => ({ name: row.traveler!, skillId: row.skillId, skill: row.skill.name }))
}

/** Every task of these skills at these tiers (at least one) */
export function tasksAtTiers(tiers: { skillId: number; tier: number }[]) {
  return db.travelerTask.findMany({
    where: { removedAt: null, OR: tiers },
    orderBy: [{ minLevel: 'asc' }, { gameId: 'asc' }],
    select: TASK,
  })
}

/** The tasks the character has now, as of its last read */
export async function playerTasks(gamePlayerId: number) {
  const rows = await db.gamePlayerTask.findMany({
    where: { gamePlayerId },
    orderBy: { travelerTask: { gameId: 'asc' } },
    select: { completed: true, travelerTask: { select: TASK } },
  })
  return rows.map((row) => ({ ...row.travelerTask, completed: row.completed }))
}
