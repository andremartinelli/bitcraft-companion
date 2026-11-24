import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client.ts'

/**
 * The Prisma client. On Vercel, DATABASE_URL is Neon's pooled URL; locally,
 * the Postgres of `npm run db:dev`; in the integration tests, TEST_DATABASE_URL.
 */
export function createClient(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL não está definida (veja o .env.example).')
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
}

export type Db = ReturnType<typeof createClient>

// One client per process: Next's dev server reloads modules on every change
const globalForDb = globalThis as unknown as { db?: Db }

/**
 * Created on first use, so importing a module that uses it never needs a
 * database (the build, the unit tests).
 */
export const db = new Proxy({} as Db, {
  get(_, property) {
    const client = (globalForDb.db ??= createClient())
    const value = Reflect.get(client, property)
    return typeof value === 'function' ? value.bind(client) : value
  },
})
