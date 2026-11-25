'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/session'
import {
  canEditPlan,
  deletePlan,
  findPlanFor,
  insertPlan,
  removePlanGroupShare,
  removePlanShare,
  saveErrorMessage,
  savePlanState,
  sharePlan,
  sharePlanWithGroup,
  updatePlanName,
} from '@/models/plan'
import { saveOnlyMyInventory } from '@/models/plan_user_setting'
import { readStateFromQuery, validateState } from '@/services/calculator/state_params'
import QuickPlans, { METAL_STYLES } from '@/services/plans/quick_plans'
import { idSchema } from '@/validators/group'
import {
  planIdSchema,
  planNameSchema,
  planSettingSchema,
  planUpdateSchema,
  quickPlanSchema,
} from '@/validators/plan'

export interface PlanFormState {
  error: string | null
  /** Typed back into the form after an error */
  name?: string
}

/** A save that failed for a known reason becomes its message; anything else goes up */
async function saving<T>(save: () => Promise<T>): Promise<{ result: T } | { error: string }> {
  try {
    return { result: await save() }
  } catch (error) {
    const message = saveErrorMessage(error)
    if (message === null) throw error
    return { error: message }
  }
}

/**
 * POST /plans: "Novo plano" (an empty plan) and "Salvar como plano" (the
 * quick calculator's state, sent as its URL query). Opens the new plan.
 */
export async function createPlan(
  _previous: PlanFormState,
  formData: FormData
): Promise<PlanFormState> {
  const user = await requireUser()
  const typed = String(formData.get('name') ?? '')
  const name = planNameSchema.safeParse(typed)
  if (!name.success) return { error: name.error.issues[0].message, name: typed }

  const query = new URLSearchParams(String(formData.get('state') ?? ''))
  const { state, errors } = readStateFromQuery(Object.fromEntries(query))
  if (errors.length) return { error: errors.join(' '), name: typed }

  const saved = await saving(() => insertPlan({ name: name.data, state, userId: user.id }))
  if ('error' in saved) return { error: saved.error, name: typed }
  redirect(`/plans/${saved.result.id}`)
}

export interface PlanUpdateResult {
  errors: string[]
}

/**
 * PATCH /plans/[id]: the calculator saves its state on every change; the
 * name field sends only the name. The owner and the accounts it was shared
 * with can change it. An invalid state saves nothing and comes back as
 * messages. Then the page shows what was saved.
 */
export async function updatePlan(id: number, input: unknown): Promise<PlanUpdateResult> {
  const user = await requireUser()
  const planId = planIdSchema.safeParse(id)
  const fields = planUpdateSchema.safeParse(input)
  if (!planId.success || !fields.success)
    return { errors: ['Alguns dados do plano são inválidos.'] }

  let name: string | undefined
  if (fields.data.name !== undefined) {
    const parsed = planNameSchema.safeParse(fields.data.name)
    if (!parsed.success) return { errors: [parsed.error.issues[0].message] }
    name = parsed.data
  }
  const state = fields.data.state === undefined ? undefined : validateState(fields.data.state)
  if (state?.errors.length) return { errors: state.errors }
  // Someone else's plan answers as a deleted one: it doesn't say it exists
  if (!(await canEditPlan(planId.data, user.id))) {
    return { errors: ['Este plano não existe mais. Ele pode ter sido apagado.'] }
  }

  const saved = await saving(async () => {
    if (name !== undefined) await updatePlanName(planId.data, name, user.id)
    if (state) await savePlanState(planId.data, state.state, user.id)
  })
  if ('error' in saved) return { errors: [saved.error] }
  refresh()
  return { errors: [] }
}

/**
 * PATCH /plans/[id]/setting: what the account chose for itself in the plan
 * ("Usar apenas meu inventário"); the plan's other people see no change
 */
export async function updatePlanSetting(id: number, input: unknown) {
  const user = await requireUser()
  const planId = planIdSchema.safeParse(id)
  const setting = planSettingSchema.safeParse(input)
  if (planId.success && setting.success && (await canEditPlan(planId.data, user.id))) {
    await saveOnlyMyInventory(planId.data, user.id, setting.data.onlyMyInventory)
  }
  refresh()
}

/** DELETE /plans/[id], after the confirmation: only the owner's; back to the list */
export async function destroyPlan(id: number) {
  const user = await requireUser()
  const planId = planIdSchema.safeParse(id)
  if (planId.success) await deletePlan(planId.data, user.id)
  redirect('/plans')
}

/**
 * POST /plans/[id]/shares: the owner shares the plan with one account of a
 * group it is in, which then sees and changes it
 */
export async function createPlanShare(id: number, userId: number) {
  const user = await requireUser()
  const planId = planIdSchema.safeParse(id)
  const memberId = idSchema.safeParse(userId)
  if (planId.success && memberId.success) await sharePlan(planId.data, user.id, memberId.data)
  refresh()
}

/**
 * POST /plans/[id]/group_shares: "Todos do grupo", the owner shares the plan
 * with a whole group it is in, also with whoever joins later
 */
export async function createPlanGroupShare(id: number, groupId: number) {
  const user = await requireUser()
  const planId = planIdSchema.safeParse(id)
  const group = idSchema.safeParse(groupId)
  if (planId.success && group.success) await sharePlanWithGroup(planId.data, user.id, group.data)
  refresh()
}

/** DELETE /plans/[id]/group_shares/[groupId]: the owner unchecks "Todos do grupo" */
export async function destroyPlanGroupShare(id: number, groupId: number) {
  const user = await requireUser()
  const planId = planIdSchema.safeParse(id)
  const group = idSchema.safeParse(groupId)
  if (planId.success && group.success) await removePlanGroupShare(planId.data, user.id, group.data)
  refresh()
}

/**
 * DELETE /plans/[id]/shares/[userId]: the owner takes an account out of the
 * plan, or an account leaves a plan shared with it (and goes back to the list).
 */
export async function destroyPlanShare(id: number, userId: number) {
  const user = await requireUser()
  const planId = planIdSchema.safeParse(id)
  const memberId = idSchema.safeParse(userId)
  if (planId.success && memberId.success) {
    await removePlanShare(planId.data, user.id, memberId.data)
  }
  if (memberId.success && memberId.data === user.id) redirect('/plans')
  refresh()
}

/**
 * POST /quick_plans: a whole armor set, every tool of a tier or a settlement
 * upgrade, as a new plan. Opens it; a tier with none of the items says so.
 */
export async function createQuickPlan(input: unknown): Promise<PlanFormState> {
  const user = await requireUser()
  const parsed = quickPlanSchema.safeParse(input)
  if (!parsed.success) return { error: 'Esse plano rápido não existe.' }

  const { template, tier, style } = parsed.data
  const plan = await new QuickPlans().create(template, tier, style ?? METAL_STYLES[0], user.id)
  if (!plan) return { error: `Nenhum item desse plano rápido no T${tier}.` }
  redirect(`/plans/${plan.id}`)
}

/**
 * POST /plans/[id]/quick_plans: "Planos rápidos" in a plan puts a set, the
 * tools or a settlement upgrade in it, summing what it already has. Then the
 * page shows it.
 */
export async function addQuickPlan(id: number, input: unknown): Promise<PlanFormState> {
  const user = await requireUser()
  const planId = planIdSchema.safeParse(id)
  const parsed = quickPlanSchema.safeParse(input)
  if (!planId.success || !parsed.success) return { error: 'Esse plano rápido não existe.' }
  // Someone else's plan answers as a deleted one, like in updatePlan
  const plan = await findPlanFor(planId.data, user.id)
  if (!plan) return { error: 'Este plano não existe mais. Ele pode ter sido apagado.' }

  const { template, tier, style } = parsed.data
  const saved = await saving(() =>
    new QuickPlans().add(plan, template, tier, style ?? METAL_STYLES[0], user.id)
  )
  if ('error' in saved) return { error: saved.error }
  if (!saved.result) return { error: `Nenhum item desse plano rápido no T${tier}.` }
  if (saved.result.length) return { error: saved.result.join(' ') }
  refresh()
  return { error: null }
}
