import { z } from 'zod'

/** E-mails are stored and compared in lowercase */
const email = () =>
  z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'Informe um e-mail válido.' }).max(254))

export const PASSWORD_MIN = 12
export const PASSWORD_MAX = 128

/**
 * `npm run users:create`: there is no sign-up page. The app is public on
 * the internet, so passwords are long.
 */
export const createUserSchema = z.object({
  email: email(),
  fullName: z.string().trim().max(100).optional().nullable(),
  password: z
    .string()
    .min(PASSWORD_MIN, { error: `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.` })
    .max(PASSWORD_MAX, { error: `A senha pode ter no máximo ${PASSWORD_MAX} caracteres.` }),
})

/** The login form. Only the format here: whether it is right is the login's business */
export const loginSchema = z.object({
  email: email(),
  password: z.string().min(1).max(PASSWORD_MAX),
})
