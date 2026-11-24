'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { startSession } from '@/lib/session'
import { signUp } from '@/services/auth/signup'
import { signupSchema } from '@/validators/user'

export interface SignupState {
  error: string | null
  /** Typed back into the form after an error; never the password */
  fullName: string
  email: string
}

/**
 * POST /signup: anyone can create an account (limited per IP). The new
 * account starts logged in, with no plans and no characters.
 */
export async function createAccount(
  _previous: SignupState,
  formData: FormData
): Promise<SignupState> {
  const fullName = String(formData.get('fullName') ?? '')
  const email = String(formData.get('email') ?? '')
  const parsed = signupSchema.safeParse({
    fullName,
    email,
    password: formData.get('password'),
    passwordConfirmation: formData.get('passwordConfirmation'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message, fullName, email }

  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const result = await signUp({ ...parsed.data, ip })
  if (!result.ok) return { error: result.error, fullName, email }

  await startSession(result.user.id)
  redirect('/plans')
}
