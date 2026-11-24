import { db } from '@/lib/db'

/** Every table but Prisma's own, emptied with the id sequences restarted */
export async function resetDatabase() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  if (!tables.length) return
  const list = tables.map(({ tablename }) => `"${tablename}"`).join(', ')
  await db.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`)
}
