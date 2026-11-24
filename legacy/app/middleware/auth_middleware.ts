import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { Authenticators } from '@adonisjs/auth/types'
import env from '#start/env'

/**
 * Login is off unless LOGIN_REQUIRED=true (decided 22/11/2026: the app is
 * only reachable by the two of them, through the local network or Tailscale).
 */
export const loginRequired = () => env.get('LOGIN_REQUIRED', false) === true

/**
 * Auth middleware is used authenticate HTTP requests and deny
 * access to unauthenticated users. With LOGIN_REQUIRED off, everyone passes.
 */
export default class AuthMiddleware {
  /**
   * The URL to redirect to, when authentication fails
   */
  redirectTo = '/login'

  async handle(
    ctx: HttpContext,
    next: NextFn,
    options: {
      guards?: (keyof Authenticators)[]
    } = {}
  ) {
    if (!loginRequired()) return next()

    await ctx.auth.authenticateUsing(options.guards, { loginRoute: this.redirectTo })
    return next()
  }
}
