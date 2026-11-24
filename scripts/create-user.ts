/**
 * npm run users:create -- --email=<e-mail> [--name="Nome"] [--password=<senha>]
 *
 * Creates an account in the database of DATABASE_URL_UNPOOLED (on Neon, the
 * direct URL). There is no sign-up page. Without --password, it is asked
 * twice, hidden.
 */
import { existsSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'

if (existsSync('.env')) process.loadEnvFile('.env')
if (process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED

const { db } = await import('@/lib/db')
const { CreateUserError, createUser } = await import('@/services/auth/create_user')

/** Reads a line without showing it (a password) */
function askHidden(question: string): Promise<string> {
  const stdin = process.stdin
  if (!stdin.isTTY) {
    // Piped in: just read a line
    const lines = createInterface({ input: stdin })
    return new Promise((resolve) => lines.once('line', (line) => (lines.close(), resolve(line))))
  }

  process.stdout.write(question)
  stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding('utf8')
  return new Promise((resolve, reject) => {
    let value = ''
    const done = () => {
      stdin.off('data', onData)
      stdin.setRawMode(false)
      stdin.pause()
      process.stdout.write('\n')
    }
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return (done(), resolve(value))
        if (char === '\u0003') return (done(), reject(new Error('Cancelado.')))
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1)
        else value += char
      }
    }
    stdin.on('data', onData)
  })
}

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    password: { type: 'string' },
  },
})

try {
  if (!values.email) throw new CreateUserError('Informe o e-mail: --email=voce@exemplo.com')
  let password = values.password
  if (password === undefined) {
    password = await askHidden('Senha (mínimo 12 caracteres): ')
    if ((await askHidden('Repita a senha: ')) !== password) {
      throw new CreateUserError('As senhas não conferem.')
    }
  }

  const user = await createUser({ email: values.email, fullName: values.name, password })
  const host = new URL(process.env.DATABASE_URL ?? 'postgres://?').host
  console.log(`Conta criada: ${user.email}${user.fullName ? ` (${user.fullName})` : ''} em ${host}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await db.$disconnect()
}
