import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import GamePlayer from '#models/game_player'
import Item from '#models/item'
import Plan from '#models/plan'
import User from '#models/user'
import InventorySync from '#services/game_sync/inventory_sync'
import { importTables } from '#tests/helpers/game_data'
import { bitjitaSource, PLAYER_ONE, PLAYER_TWO } from '#tests/helpers/bitjita'

const idOf = async (kind: 'item' | 'cargo', gameId: number) => {
  const item = await Item.findByOrFail({ kind, gameId })
  return item.id
}

const sync = async () => {
  await GamePlayer.createMany([PLAYER_ONE, PLAYER_TWO])
  await new InventorySync(bitjitaSource()).run('manual')
}

/**
 * Group stock in the fixtures (claim chests not read): 68 Rough Plank,
 * 10 Rough Stripped Wood, 27 Rough Wood Log. A plank takes 2 stripped wood;
 * stripped wood takes 1 log.
 */
test.group('Calculator with the group inventory', (group) => {
  let user: User
  let plank: number
  let stripped: number

  group.each.setup(async () => {
    const rollback = await testUtils.db().withGlobalTransaction()
    await importTables()
    user = await User.create({ email: 'vitor@example.com', password: 'secret-123' })
    plank = await idOf('item', 1030)
    stripped = await idOf('item', 1020)
    return rollback
  })

  const calculator = (query: string) => `/calculator?targets[0][item_id]=${plank}${query}`

  test('without a sync there is no inventory option', async ({ client, assert }) => {
    const response = await client.get(calculator('&targets[0][quantity]=10')).loginAs(user)

    response.assertStatus(200)
    assert.notInclude(response.text(), 'Usar inventário do grupo')
    assert.notInclude(response.text(), 'do inventário')
  })

  test('once synced, the inventory fills "já tenho" by default', async ({ client }) => {
    await sync()

    const response = await client.get(calculator('&targets[0][quantity]=10')).loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('Usar inventário do grupo')
    response.assertTextIncludes('name="inventory" value="1"')
    response.assertTextIncludes('usando 10 do inventário')
    // The planks they have cover it: the step is done and says why
    response.assertTextIncludes('vocês já têm 68')
  })

  test('a value typed by hand wins, even 0', async ({ client, assert }) => {
    await sync()

    const response = await client
      .get(calculator(`&targets[0][quantity]=10&owned[i${plank}]=0&owned[i${stripped}]=3`))
      .loginAs(user)

    response.assertStatus(200)
    assert.notInclude(response.text(), 'usando 10 do inventário')
    // 10 planks need 20 stripped wood: 3 typed by hand, 17 logs from the inventory
    response.assertTextIncludes('usando 3 que vocês informaram')
    response.assertTextIncludes('usando 17 do inventário')
  })

  test('inventory=0 turns it off and stays in the URL', async ({ client, assert }) => {
    await sync()

    const response = await client
      .get(calculator('&targets[0][quantity]=10&inventory=0'))
      .header('HX-Request', 'true')
      .loginAs(user)

    response.assertStatus(200)
    response.assertTextIncludes('name="inventory" value="0"')
    assert.notInclude(response.text(), 'do inventário')
    assert.include(response.header('hx-push-url'), 'inventory=0')
  })

  test('"Coletar" says who has each raw material', async ({ client, assert }) => {
    await sync()
    const log = await idOf('item', 1010)

    // 30 planks, ignoring the ones in stock: 60 stripped wood, 10 in stock;
    // logs as raw material, 50 needed
    const response = await client
      .get(calculator(`&targets[0][quantity]=30&owned[i${plank}]=0&choices[i${log}]=raw`))
      .loginAs(user)

    response.assertStatus(200)
    const holders = response.text().match(/class="gather__holders">([^<]*)</)
    assert.isNotNull(holders)
    assert.match(holders![1], /^Nimbus \d+ · Quartz \d+$/)
  })

  test('a plan saves the option', async ({ client, assert }) => {
    await sync()
    const plan = await Plan.create({ name: 'Ferramentas T2', createdById: user.id })
    await plan.saveState(
      { targets: [{ itemId: plank, quantity: 10 }], choices: {}, owned: {} },
      user
    )

    const on = await client.get(`/plans/${plan.id}`).loginAs(user)
    on.assertTextIncludes('usando 10 do inventário')

    const off = await client
      .patch(`/plans/${plan.id}`)
      .form({ 'targets[0][item_id]': plank, 'targets[0][quantity]': 10, 'inventory': '0' })
      .header('HX-Request', 'true')
      .withCsrfToken()
      .loginAs(user)

    off.assertStatus(200)
    assert.notInclude(off.text(), 'do inventário')
    await plan.refresh()
    assert.isFalse(plan.useInventory)
  })
})
