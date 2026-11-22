/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| Resourceful routes first, like config/routes.rb. There is no self-signup:
| accounts are created with `node ace users:create`.
|
*/

import { middleware } from '#start/kernel'
import { controllers } from '#generated/controllers'
import router from '@adonisjs/core/services/router'

router
  .group(() => {
    router.get('login', [controllers.Session, 'create'])
    router.post('login', [controllers.Session, 'store'])
  })
  .use(middleware.guest())

router
  .group(() => {
    router.on('/').redirect('plans.index').as('home')
    router.resource('recipes', controllers.Recipes).only(['index'])
    router.resource('items', controllers.Items).only(['index', 'show'])
    router.get('calculator', [controllers.Calculator, 'show']).as('calculator.show')
    router
      .resource('plans', controllers.Plans)
      .only(['index', 'store', 'show', 'update', 'destroy'])
    router.get('inventory', [controllers.Inventory, 'index']).as('inventory.index')
    // The "Sincronizar agora" button: reads BitJita now
    router.post('inventory/sync', [controllers.Inventory, 'sync']).as('inventory.sync')
    router.resource('game_players', controllers.GamePlayers).only(['index', 'store', 'destroy'])
    router.post('logout', [controllers.Session, 'destroy'])
  })
  .use([middleware.auth(), middleware.gameData()])
