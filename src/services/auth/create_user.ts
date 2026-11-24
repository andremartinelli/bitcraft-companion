import { db } from '@/lib/db'
import { hashPassword } from '@/services/auth/password'
import { createUserSchema } from '@/validators/user'

export class CreateUserError extends Error {}

/**
 * Creates an account: the sign-up page (see signUp) and `npm run users:create`.
 *
 * @throws CreateUserError with the messages to show, in Portuguese
 */
export async function createUser(input: {
  email: string
  fullName?: string | null
  password: string
  /** Where a sign-up came from (the limit per IP) */
  signupIp?: string | null
}) {
  const parsed = createUserSchema.safeParse(input)
  if (!parsed.success) {
    throw new CreateUserError(parsed.error.issues.map((issue) => issue.message).join(' '))
  }
  const { email, fullName, password } = parsed.data

  if (await db.user.findUnique({ where: { email } })) {
    throw new CreateUserError(`Já existe uma conta com o e-mail ${email}.`)
  }
  return db.user.create({
    data: {
      email,
      fullName: fullName || null,
      password: await hashPassword(password),
      signupIp: input.signupIp ?? null,
    },
    select: { id: true, email: true, fullName: true },
  })
}
