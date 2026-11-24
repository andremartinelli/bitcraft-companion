'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { endSession, localPath, startSession } from '@/lib/session'
import { attemptLogin, LOCKOUT_MINUTES } from '@/services/auth/login'
import { loginSchema } from '@/validators/user'

export interface LoginState {
  error: string | null
  /** Typed back into the form after an error; never the password */
  email: string
}

/**
 * POST /login: logs in and goes back to the page that asked for it (`next`,
 * only a path of this site), or to Planos.
 */
export async function createSession(
  _previous: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '')
  const parsed = loginSchema.safeParse({ email, password: formData.get('password') })
  if (!parsed.success) return { error: 'Informe o e-mail e a senha.', email }

  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const result = await attemptLogin({ ...parsed.data, ip })
  if (!result.ok) {
    return {
      error:
        result.reason === 'locked'
          ? `Muitas tentativas erradas para este e-mail. Espere ${LOCKOUT_MINUTES} minutos e tente de novo.`
          : 'E-mail ou senha incorretos.',
      email,
    }
  }

  await startSession(result.user.id)
  redirect(localPath(formData.get('next')) ?? '/plans')
}

/** "Sair" */
export async function destroySession() {
  await endSession()
  redirect('/login')
}
