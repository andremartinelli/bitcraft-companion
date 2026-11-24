import { z } from 'zod'

/** E-mails are stored and compared in lowercase */
const email = () =>
  z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'Informe um e-mail válido.' }).max(254))

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128

const password = () =>
  z
    .string({ error: `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.` })
    .min(PASSWORD_MIN, { error: `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.` })
    .max(PASSWORD_MAX, { error: `A senha pode ter no máximo ${PASSWORD_MAX} caracteres.` })

/** A new account: the sign-up page and `npm run users:create` */
export const createUserSchema = z.object({
  email: email(),
  fullName: z.string().trim().max(100).optional().nullable(),
  password: password(),
})

/** POST /signup: the account, with the password typed twice */
export const signupSchema = z
  .object({
    fullName: z
      .string({ error: 'Informe o seu nome.' })
      .trim()
      .min(1, { error: 'Informe o seu nome.' })
      .max(100, { error: 'O nome pode ter no máximo 100 caracteres.' }),
    email: email(),
    password: password(),
    passwordConfirmation: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    error: 'As senhas não conferem.',
    path: ['passwordConfirmation'],
  })

/** The login form. Only the format here: whether it is right is the login's business */
export const loginSchema = z.object({
  email: email(),
  password: z.string().min(1).max(PASSWORD_MAX),
})
