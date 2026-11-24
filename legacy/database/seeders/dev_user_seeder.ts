import { BaseSeeder } from '@adonisjs/lucid/seeders'
import User from '#models/user'

/**
 * A login for local development only (`node ace db:seed`).
 * Real accounts are created with `node ace users:create`.
 */
export default class DevUserSeeder extends BaseSeeder {
  static environment = ['development']

  async run() {
    await User.updateOrCreate(
      { email: 'dev@example.com' },
      { fullName: 'Dev', password: 'dev-password' }
    )
  }
}
