/**
 * npm run db:seed: a login for local development only.
 * Real accounts are created with `npm run users:create`.
 *
 * E-mail: dev@example.com · Senha: dev-password-local
 */
import { existsSync } from 'node:fs'

if (existsSync('.env')) process.loadEnvFile('.env')
if (process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED

const host = new URL(process.env.DATABASE_URL ?? 'postgres://?').hostname
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`O seed só roda num banco local, não em ${host}.`)
  process.exit(1)
}

const { db } = await import('@/lib/db')
const { hashPassword } = await import('@/services/auth/password')

const email = 'dev@example.com'
const password = await hashPassword('dev-password-local')
await db.user.upsert({
  where: { email },
  create: { email, fullName: 'Dev', password },
  update: { password },
})
console.log(`Usuário de desenvolvimento: ${email}`)
await db.$disconnect()
