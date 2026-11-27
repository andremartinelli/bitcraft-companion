import { beforeEach, describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import { holdersLabel } from '@/services/inventory/professions'
import { taskBoard } from '@/services/tasks/task_board'
import { importTables } from '../../helpers/game_data'
import { syncBothPlayers } from '../../helpers/inventory'

const summary = (
  tasks: {
    tier: number
    completed: boolean
    lines: { item: { name: string }; quantity: number; have: number }[]
  }[]
) =>
  tasks.map((task) => [
    task.tier,
    task.completed,
    task.lines.map((line) => `${line.quantity} ${line.item.name} (tem ${line.have})`),
  ])

describe("the travelers' tasks page", () => {
  let userId: number

  beforeEach(async () => {
    await importTables()
    userId = (await syncBothPlayers()).userId
  })

  test("the character's tasks now, and the ones of its tier, with how many it has", async () => {
    const board = (await taskBoard(userId))!

    // Construction 57740 XP = level 25; Nimbus completed "Brick by Brick (I)": T2.
    // Only travelers with tasks: Brico
    expect(
      board.travelers.map((t) => [t.name, t.skill, t.level, t.tier, t.tierFromQuests])
    ).toEqual([['Brico', 'Construction', 25, 2, true]])
    const [brico] = board.travelers
    // Only the account's character counts outside a plan: Nimbus has 50 of the 68 planks
    expect(summary(brico.current)).toEqual([
      [1, false, ['5 Rough Plank (tem 50)']],
      [2, false, ['3 Simple Plank (tem 1)', '2 Rough Wood Trunk (tem 3)']],
    ])
    expect(summary(brico.possible)).toEqual([
      [2, false, ['3 Simple Plank (tem 1)', '2 Rough Wood Trunk (tem 3)']],
      [2, false, ['10 Rough Wood Scraps (tem 7)']],
    ])
    // Where each item is, and in which places, like the plan's "Coletar"
    expect(holdersLabel(brico.current[0].lines[0].holders)).toBe(
      'Nimbus 50 (Settlement Stash 40, Banco 10)'
    )
    expect(holdersLabel(brico.current[1].lines[0].holders)).toMatch(/^Nimbus 1 \([^,]+\)$/)
  })

  test("a task of the tier above the character's level does not show", async () => {
    // 35660 XP = level 21: T2, but task 9003 asks for level 25
    await db.gamePlayer.updateMany({ data: { skills: { '15': 35660 } } })
    const [brico] = (await taskBoard(userId))!.travelers
    expect([brico.level, brico.tier]).toEqual([21, 2])
    expect(summary(brico.possible)).toEqual([
      [2, false, ['3 Simple Plank (tem 1)', '2 Rough Wood Trunk (tem 3)']],
    ])
  })

  test("the tier is the quests', not the level's: level 25 without the quest is T1", async () => {
    await db.gamePlayer.updateMany({ data: { completedQuestChainIds: [] } })
    const [brico] = (await taskBoard(userId))!.travelers
    expect([brico.level, brico.tier]).toEqual([25, 1])
    expect(summary(brico.possible)).toEqual([[1, false, ['5 Rough Plank (tem 50)']]])
  })

  test('the highest tier unlocked counts', async () => {
    await db.gamePlayer.updateMany({
      data: { completedQuestChainIds: [8001, 8003, 8002], skills: { '15': 103110 } },
    })
    const [brico] = (await taskBoard(userId))!.travelers
    expect([brico.level, brico.tier]).toEqual([30, 3])
  })

  test('a skill no quest unlocks (Hunting) goes by the level', async () => {
    await db.taskTierUnlock.deleteMany()
    await db.gamePlayer.updateMany({ data: { completedQuestChainIds: [] } })
    const [brico] = (await taskBoard(userId))!.travelers
    expect([brico.level, brico.tier, brico.tierFromQuests]).toEqual([25, 2, false])
  })

  test('an account without a character has no board', async () => {
    const other = await db.user.create({ data: { email: 'x@example.com', password: '-' } })
    expect(await taskBoard(other.id)).toBeNull()
  })
})
