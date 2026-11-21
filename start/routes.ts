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
    router.on('/').redirect('recipes.index').as('home')
    router.resource('recipes', controllers.Recipes).only(['index'])
    router.post('logout', [controllers.Session, 'destroy'])
  })
  .use(middleware.auth())
