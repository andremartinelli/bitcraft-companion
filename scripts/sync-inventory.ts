/**
 * npm run inventory:sync
 *
 * Reads the inventories of the registered characters from BitJita's public
 * API (no token) into the database of DATABASE_URL_UNPOOLED. The same sync
 * runs from "Sincronizar agora", when a page finds the inventory old, and
 * from the daily cron.
 */
import { existsSync } from 'node:fs'

if (existsSync('.env')) process.loadEnvFile('.env')
if (process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED

const { db } = await import('@/lib/db')
const { inventorySource } = await import('@/services/game_sync/inventory_source')
const {
  default: InventorySync,
  SyncAlreadyRunningError,
  syncSummary,
} = await import('@/services/game_sync/inventory_sync')

try {
  const run = await new InventorySync(inventorySource()).run('manual')
  const label = { ok: 'Sincronização concluída.', partial: 'Sincronização parcial.' }
  console.log(
    `${label[run.status as keyof typeof label] ?? 'Sincronização falhou.'} ${syncSummary(run)}`
  )
  for (const line of (run.message ?? '').split('\n').filter(Boolean)) console.log(line)
  if (run.status === 'failed') process.exitCode = 1
} catch (error) {
  if (!(error instanceof SyncAlreadyRunningError)) throw error
  console.warn(error.message)
  process.exitCode = 1
} finally {
  await db.$disconnect()
}
