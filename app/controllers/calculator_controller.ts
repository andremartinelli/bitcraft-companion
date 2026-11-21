import type { HttpContext } from '@adonisjs/core/http'
import RecipeGraph from '#services/calculator/recipe_graph'
import { plan } from '#services/calculator/production_planner'
import { present } from '#services/calculator/presenter'
import { readState, stateToFields, stateToQuery } from '#services/calculator/state_params'

const isHtmx = (request: HttpContext['request']) =>
  Boolean(request.header('HX-Request')) && !request.header('HX-Boosted')

/**
 * The quick calculator: the whole state lives in the query string, so a link
 * reproduces the calculation. Nothing is saved.
 */
export default class CalculatorController {
  async show({ request, response, view }: HttpContext) {
    const { state, errors, changed } = await readState(request.qs())
    const canonicalUrl = `/calculator${state.targets.length ? `?${stateToQuery(state)}` : ''}`

    if (changed && !isHtmx(request)) return response.redirect().clearQs().toPath(canonicalUrl)

    const graph = await RecipeGraph.current()
    const data = {
      panel: present(graph, state, plan(graph, state)),
      errors,
      form: { method: 'get', action: '/calculator' },
      saveFields: stateToFields(state),
    }
    if (errors.length) response.status(422)

    if (isHtmx(request)) {
      response.header('HX-Push-Url', canonicalUrl)
      return view.render('components/calculator/panel', data)
    }
    return view.render('pages/calculator/show', data)
  }
}
