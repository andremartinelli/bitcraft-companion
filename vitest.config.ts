import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

if (existsSync('.env')) process.loadEnvFile('.env')

/**
 * unit: no database, in parallel. integration: the Postgres of
 * `npm run db:test`, one file at a time, emptied before every test.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['tests/helpers/integration_setup.ts'],
          fileParallelism: false,
          // The app's client (src/lib/db.ts) reads DATABASE_URL on first use
          env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? '' },
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
})
