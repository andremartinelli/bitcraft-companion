import type { HttpContext } from '@adonisjs/core/http'
import Plan from '#models/plan'
import RecipeGraph from '#services/calculator/recipe_graph'
import { withInventory } from '#services/calculator/inventory_owned'
import { plan as runPlan } from '#services/calculator/production_planner'
import { present } from '#services/calculator/presenter'
import { readState } from '#services/calculator/state_params'
import { planNameValidator } from '#validators/plan'

const STATE_KEYS = ['targets', 'choices', 'owned', 'inventory', 'add', 'remove']

const isHtmx = (request: HttpContext['request']) =>
  Boolean(request.header('HX-Request')) && !request.header('HX-Boosted')

/**
 * Saved calculator plans, shared by both users. The plan page is the same
 * calculator, saving on every change.
 */
export default class PlansController {
  async index({ view }: HttpContext) {
    const plans = await Plan.query()
      .preload('updatedBy')
      .withCount('items')
      .orderBy('updated_at', 'desc')
      .orderBy('id', 'desc')
    return view.render('pages/plans/index', { plans })
  }

  async store({ request, response, auth, session }: HttpContext) {
    const { name } = await request.validateUsing(planNameValidator)
    const { state, errors } = await readState(request.all())
    if (errors.length) {
      session.flash('error', errors.join(' '))
      return response.redirect().back()
    }

    const user = auth.getUserOrFail()
    const plan = await Plan.create({ name, createdById: user.id, updatedById: user.id })
    await plan.saveState(state, user)
    return response.redirect().toRoute('plans.show', { id: plan.id })
  }

  async show({ params, view }: HttpContext) {
    const plan = await this.#find(params.id)
    return view.render(
      'pages/plans/show',
      await this.#panelData(plan, plan.toCalculatorState(), [])
    )
  }

  /**
   * PATCH /plans/:id. The calculator form saves the state; the rename form
   * sends only `name` and leaves the state alone.
   */
  async update({ params, request, response, auth, view }: HttpContext) {
    const plan = await this.#find(params.id)
    const user = auth.getUserOrFail()

    if (request.input('name') !== undefined) {
      const { name } = await request.validateUsing(planNameValidator)
      plan.merge({ name, updatedById: user.id })
      await plan.save()
    }

    const hasState = STATE_KEYS.some((key) => request.input(key) !== undefined)
    if (!hasState) {
      if (isHtmx(request)) return response.noContent()
      return response.redirect().toRoute('plans.show', { id: plan.id })
    }

    const { state, errors } = await readState(request.all())
    if (errors.length) {
      response.status(422)
      return view.render(
        'components/calculator/panel',
        await this.#panelData(plan, plan.toCalculatorState(), errors)
      )
    }

    await plan.saveState(state, user)
    if (!isHtmx(request)) return response.redirect().toRoute('plans.show', { id: plan.id })
    return view.render('components/calculator/panel', await this.#panelData(plan, state, []))
  }

  async destroy({ params, request, response }: HttpContext) {
    const plan = await this.#find(params.id)
    await plan.delete()
    if (isHtmx(request)) {
      response.header('HX-Redirect', '/plans')
      return response.noContent()
    }
    return response.redirect().toRoute('plans.index')
  }

  async #find(id: string | number) {
    return Plan.query()
      .where('id', Number(id) || 0)
      .preload('items', (q) => q.orderBy('position'))
      .preload('choices')
      .preload('ownedItems')
      .preload('updatedBy')
      .firstOrFail()
  }

  async #panelData(plan: Plan, state: ReturnType<Plan['toCalculatorState']>, errors: string[]) {
    const graph = await RecipeGraph.current()
    const { planState, sources, totals, inventory } = await withInventory(state)
    return {
      plan,
      panel: present(graph, state, runPlan(graph, planState), {
        sources,
        inventoryTotals: totals,
        inventory,
      }),
      errors,
      form: { method: 'patch', action: `/plans/${plan.id}` },
      saveFields: null,
    }
  }
}
