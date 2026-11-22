import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Plan from '#models/plan'
import User from '#models/user'
import { importTables, withSetsAndTools } from '#tests/helpers/game_data'

test.group('Quick plans page', (group) => {
  let user: User

  group.each.setup(async () => {
    const rollback = await testUtils.db().withGlobalTransaction()
    await importTables(withSetsAndTools())
    user = await User.create({ email: 'vitor@example.com', password: 'secret-123' })
    return rollback
  })

  test('the Planos page has the menu: Planos rápidos › set › (style ›) tier', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/plans').loginAs(user)
    const html = response.text()

    response.assertStatus(200)
    response.assertTextIncludes('Planos rápidos')
    response.assertTextIncludes('Set de couro completo')
    response.assertTextIncludes('Set de cloth completo')
    response.assertTextIncludes('Set de minério completo')
    response.assertTextIncludes('Ferramentas')
    response.assertTextIncludes('T2 · Simple (2 itens)')
    assert.notInclude(html, '@!', 'an Edge tag leaked into the HTML')
    // Each tier is a form that creates the plan; the metal set has one per style
    assert.match(
      html,
      /name="template" value="tools"\s*\/>\s*<input type="hidden" name="tier" value="1"/
    )
    assert.include(html, '<input type="hidden" name="style" value="Duelist" />')
    assert.include(html, '<input type="hidden" name="style" value="Plated" />')
    assert.notInclude(html, '<select')
  })

  test('creating one opens the new plan with the whole set', async ({ client, assert }) => {
    const response = await client
      .post('/quick_plans')
      .form({ template: 'tools', tier: 1 })
      .withCsrfToken()
      .redirects(0)
      .loginAs(user)

    response.assertStatus(302)
    const plan = await Plan.query().preload('items').firstOrFail()
    response.assertHeader('location', `/plans/${plan.id}`)
    assert.equal(plan.name, 'Ferramentas T1')
    assert.lengthOf(plan.items, 3)
  })

  test('the metal set keeps the chosen style', async ({ client, assert }) => {
    await client
      .post('/quick_plans')
      .form({ template: 'metal', tier: 2, style: 'Plated' })
      .withCsrfToken()
      .redirects(0)
      .loginAs(user)

    const plan = await Plan.query().preload('items').firstOrFail()
    assert.equal(plan.name, 'Set de minério Plated T2')
    assert.lengthOf(plan.items, 2)
  })

  test('a tier with none of the items says so', async ({ client, assert }) => {
    const response = await client
      .post('/quick_plans')
      .form({ template: 'cloth', tier: 7 })
      .withCsrfToken()
      .redirects(0)
      .loginAs(user)

    response.assertStatus(302)
    response.assertHeader('location', '/plans')
    response.assertFlashMessage('error', 'Nenhum item desse plano rápido no T7.')
    assert.lengthOf(await Plan.all(), 0)
  })

  test('an unknown set is refused', async ({ client, assert }) => {
    const response = await client
      .post('/quick_plans')
      .form({ template: 'jewelry', tier: 2 })
      .withCsrfToken()
      .redirects(0)
      .loginAs(user)

    response.assertStatus(302)
    assert.lengthOf(await Plan.all(), 0)
  })
})
