import { db } from '@/lib/db'
import { hashPassword } from '@/services/auth/password'
import { createUserSchema } from '@/validators/user'

export class CreateUserError extends Error {}

/**
 * Creates an account (`npm run users:create`). There is no sign-up page:
 * the two accounts are made from the command line.
 *
 * @throws CreateUserError with the messages to show, in Portuguese
 */
export async function createUser(input: {
  email: string
  fullName?: string | null
  password: string
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
    data: { email, fullName: fullName || null, password: await hashPassword(password) },
    select: { id: true, email: true, fullName: true },
  })
}
