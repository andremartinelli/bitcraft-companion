import type { HttpContext } from '@adonisjs/core/http'
import QuickPlans, { METAL_STYLES } from '#services/plans/quick_plans'
import { createQuickPlanValidator } from '#validators/quick_plan'

/**
 * Quick plans: a whole armor set or every tool of a tier, in one plan.
 */
export default class QuickPlansController {
  async store({ request, response, session, auth }: HttpContext) {
    const { template, tier, style } = await request.validateUsing(createQuickPlanValidator)

    const plan = await new QuickPlans().create(
      template,
      tier,
      style ?? METAL_STYLES[0],
      auth.user ?? null
    )
    if (!plan) {
      session.flash('error', `Nenhum item desse plano rápido no T${tier}.`)
      return response.redirect().toRoute('plans.index')
    }
    return response.redirect().toRoute('plans.show', { id: plan.id })
  }
}
