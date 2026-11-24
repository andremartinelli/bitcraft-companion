'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/session'
import {
  deletePlan,
  insertPlan,
  saveErrorMessage,
  savePlanState,
  updatePlanName,
} from '@/models/plan'
import { readStateFromQuery, validateState } from '@/services/calculator/state_params'
import QuickPlans, { METAL_STYLES } from '@/services/plans/quick_plans'
import { planIdSchema, planNameSchema, planUpdateSchema, quickPlanSchema } from '@/validators/plan'

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
 * name field sends only the name. An invalid state saves nothing and comes
 * back as messages. Then the page shows what was saved.
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

  const saved = await saving(async () => {
    if (name !== undefined) await updatePlanName(planId.data, name, user.id)
    if (state) await savePlanState(planId.data, state.state, user.id)
  })
  if ('error' in saved) return { errors: [saved.error] }
  refresh()
  return { errors: [] }
}

/** DELETE /plans/[id], after the confirmation: back to the list */
export async function destroyPlan(id: number) {
  await requireUser()
  const planId = planIdSchema.safeParse(id)
  if (planId.success) await deletePlan(planId.data)
  redirect('/plans')
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
