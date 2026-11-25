'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { localPath, startSession } from '@/lib/session'
import { signUp } from '@/services/auth/signup'
import { signupSchema } from '@/validators/user'

export interface SignupState {
  error: string | null
  /** Typed back into the form after an error; never the password */
  fullName: string
  email: string
  gamePlayerUsername: string
}

/**
 * POST /signup: anyone can create an account (limited per IP). The new
 * account starts logged in, with no plans and, when the nick was given and
 * BitJita found it, with its character. It goes to `next` (only a path of
 * this site, like an invite's link) or to Planos.
 */
export async function createAccount(
  _previous: SignupState,
  formData: FormData
): Promise<SignupState> {
  const fullName = String(formData.get('fullName') ?? '')
  const email = String(formData.get('email') ?? '')
  const gamePlayerUsername = String(formData.get('gamePlayerUsername') ?? '')
  const typed = { fullName, email, gamePlayerUsername }
  const parsed = signupSchema.safeParse({
    ...typed,
    password: formData.get('password'),
    passwordConfirmation: formData.get('passwordConfirmation'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message, ...typed }

  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const result = await signUp({ ...parsed.data, ip })
  if (!result.ok) return { error: result.error, ...typed }

  await startSession(result.user.id)
  redirect(localPath(formData.get('next')) ?? '/plans')
}
