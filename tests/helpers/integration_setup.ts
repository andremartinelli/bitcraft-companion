import { afterAll, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { resetDatabase } from './database'

// Every test empties the database: never the dev one (or Neon) by mistake
const testUrl = process.env.TEST_DATABASE_URL
if (
  !testUrl ||
  process.env.DATABASE_URL !== testUrl ||
  testUrl === process.env.DATABASE_URL_UNPOOLED
) {
  throw new Error(
    'Os testes de integração precisam de TEST_DATABASE_URL, diferente do banco de dev (veja o .env.example).'
  )
}

beforeEach(resetDatabase)
afterAll(() => db.$disconnect())
