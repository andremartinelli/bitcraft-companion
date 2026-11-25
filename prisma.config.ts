import { existsSync } from 'node:fs'
import { defineConfig } from 'prisma/config'

// Prisma 7 does not read .env by itself. Vercel sets the variables directly.
if (existsSync('.env')) process.loadEnvFile('.env')

/**
 * Migrations and scripts use the direct URL (no pooler): on Neon, pooled
 * connections do not support everything migrations need.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || '',
    // Local only: `prisma migrate dev` diffs against this throwaway database
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL || undefined,
  },
})
