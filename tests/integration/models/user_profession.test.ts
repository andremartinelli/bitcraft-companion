import { beforeEach, describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import { insertPlan } from '@/models/plan'
import { savePlanOtherSteps } from '@/models/plan_user_setting'
import {
  professionChoices,
  professionIdsOf,
  saveOtherSteps,
  saveProfession,
  stepsSettingOf,
} from '@/models/user_profession'
import { createUser } from '@/services/auth/create_user'
import { emptyState } from '@/services/calculator/state_params'
import { importTables } from '../../helpers/game_data'

const user = (email: string) =>
  createUser({ email, fullName: email.split('@')[0], password: 'a-long-enough-password' })

describe('"Minhas profissões"', () => {
  let userId: number

  beforeEach(async () => {
    await importTables()
    userId = (await user('vitor@example.com')).id
  })

  test('lists the skills that craft or gather, without ANY and Construction', async () => {
    expect((await professionChoices()).map((s) => s.name)).toEqual(['Carpentry', 'Forestry'])
  })

  test('marks and unmarks a profession; a skill that is not one saves nothing', async () => {
    expect(await saveProfession(userId, 2, true)).toBe(true)
    expect(await saveProfession(userId, 2, true)).toBe(true)
    expect(await saveProfession(userId, 3, true)).toBe(true)
    expect(await saveProfession(userId, 15, true)).toBe(false)
    expect((await professionIdsOf(userId)).sort()).toEqual([2, 3])
    await saveProfession(userId, 3, false)
    expect(await professionIdsOf(userId)).toEqual([2])
    expect(await stepsSettingOf(userId)).toEqual({
      professions: ['Forestry'],
      allProfessions: ['Carpentry', 'Forestry'],
      otherSteps: 'show',
    })
  })

  test('a plan starts with the account default; each person changes it only for them', async () => {
    const other = (await user('ana@example.com')).id
    const plan = await insertPlan({ name: 'Tábuas', userId, state: emptyState() })
    expect((await stepsSettingOf(userId, plan.id)).otherSteps).toBe('show')

    await saveOtherSteps(userId, 'collapse')
    expect((await stepsSettingOf(userId)).otherSteps).toBe('collapse')
    expect((await stepsSettingOf(userId, plan.id)).otherSteps).toBe('collapse')

    await savePlanOtherSteps(plan.id, userId, 'hide')
    expect((await stepsSettingOf(userId, plan.id)).otherSteps).toBe('hide')
    expect((await stepsSettingOf(userId)).otherSteps).toBe('collapse')
    expect((await stepsSettingOf(other, plan.id)).otherSteps).toBe('show')
    expect(await db.planUserSetting.count()).toBe(1)
  })
})
