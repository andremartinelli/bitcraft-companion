import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { inventorySource } from '@/services/game_sync/inventory_source'
import { SyncAlreadyRunningError } from '@/services/game_sync/inventory_sync'
import { syncIfStale } from '@/services/game_sync/stale_sync'

/** BitJita answers in a few seconds; the default limit is enough, this is a ceiling */
export const maxDuration = 60

/** The Vercel cron sends "Authorization: Bearer <CRON_SECRET>" */
function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET
  if (!secret || !header) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const given = Buffer.from(header)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/**
 * GET /api/cron/inventory-sync: the daily sync (vercel.json). Open without a
 * session (src/proxy.ts), so it has its own key. Does nothing without
 * characters or when a sync ran recently.
 */
export async function GET(request: Request) {
  if (!authorized(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const run = await syncIfStale(inventorySource(), 'cron')
    if (!run) return NextResponse.json({ status: 'skipped' })
    return NextResponse.json({ status: run.status, counts: run.counts, message: run.message })
  } catch (error) {
    if (error instanceof SyncAlreadyRunningError) return NextResponse.json({ status: 'running' })
    throw error
  }
}
