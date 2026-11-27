import type { OtherStepsMode } from '@/generated/prisma/client.ts'
import { db } from '@/lib/db'
import type { StepsSetting } from '@/services/calculator/steps_view'

/**
 * "Minhas profissões" (decided 2026-11-27): the professions an account does.
 * The Steps put them first and show, collapse or hide the steps of the
 * others (users.other_steps; in a plan, each person's plan_user_settings).
 * An account with none marked filters nothing.
 */

/**
 * Skills that craft or gather something but are not a profession to pick:
 * buildings, pets, boats, monsters, the Hexite reserve and Cooking (decided
 * 2026-11-27); nor is "ANY". Their steps always show, for everyone.
 */
const NOT_PROFESSIONS = [
  'ANY',
  'Construction',
  'Taming',
  'Sailing',
  'Slayer',
  'Hexite Gathering',
  'Cooking',
]

/** The professions to pick from: the skills of active recipes or gatherings, by name */
export async function professionChoices() {
  return db.skill.findMany({
    where: {
      name: { notIn: NOT_PROFESSIONS },
      OR: [
        { recipes: { some: { removedAt: null, kind: 'crafting' } } },
        { extractionRecipes: { some: { removedAt: null } } },
      ],
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
}

/** The skill ids the account marked */
export async function professionIdsOf(userId: number) {
  const rows = await db.userProfession.findMany({ where: { userId }, select: { skillId: true } })
  return rows.map((row) => row.skillId)
}

/** Marks or unmarks a profession; false, saving nothing, for a skill that is not one */
export async function saveProfession(userId: number, skillId: number, on: boolean) {
  if (!(await professionChoices()).some((skill) => skill.id === skillId)) return false
  if (on) {
    await db.userProfession.upsert({
      where: { userId_skillId: { userId, skillId } },
      create: { userId, skillId },
      update: {},
    })
  } else {
    await db.userProfession.deleteMany({ where: { userId, skillId } })
  }
  return true
}

/** The account's default for the steps of other professions */
export async function saveOtherSteps(userId: number, otherSteps: OtherStepsMode) {
  await db.user.update({ where: { id: userId }, data: { otherSteps } })
}

/**
 * The Steps' setting for an account: in a plan, its own choice there when it
 * made one, else the account's default
 */
export async function stepsSettingOf(userId: number, planId?: number): Promise<StepsSetting> {
  const [user, planSetting, all] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { otherSteps: true, professions: { select: { skill: { select: { name: true } } } } },
    }),
    planId
      ? db.planUserSetting.findUnique({
          where: { planId_userId: { planId, userId } },
          select: { otherSteps: true },
        })
      : null,
    professionChoices(),
  ])
  const allProfessions = all.map((skill) => skill.name)
  return {
    // A skill marked before it left the list (Cooking) is no profession any more
    professions: user.professions
      .map((p) => p.skill.name)
      .filter((name) => allProfessions.includes(name)),
    allProfessions,
    otherSteps: planSetting?.otherSteps ?? user.otherSteps,
  }
}
