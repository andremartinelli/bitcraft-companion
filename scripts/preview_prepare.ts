/**
 * Part of `npm run build`. Only in a Vercel preview build (VERCEL_ENV=preview):
 * applies this branch's migrations to the preview's own Neon branch and
 * creates or refreshes the test account. Any other build (production, CI,
 * local) skips it: production migrates only through releases.
 *
 * Characters followed by the test account: PREVIEW_GAME_PLAYERS, a Vercel
 * variable of the Preview environment ("Nick1, Nick2"), kept out of git.
 */
import { execSync } from 'node:child_process'
import { isPreview } from '@/lib/preview'

if (!isPreview()) {
  console.log('preview_prepare: não é um build de preview, nada a fazer.')
  process.exit(0)
}

// The Neon integration injects both; the direct one may come empty in the build
const directUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
if (!directUrl) {
  console.error(
    'preview_prepare: o preview não tem banco. Ligue os branches de preview do Neon (docs/deploy.md).'
  )
  process.exit(1)
}
process.env.DATABASE_URL = directUrl

execSync('npx prisma migrate deploy', { stdio: 'inherit' })

const { db } = await import('@/lib/db')
const { inventorySource } = await import('@/services/game_sync/inventory_source')
const { playerNames, preparePreviewAccount } = await import('@/services/preview/preview_account')

const { warnings } = await preparePreviewAccount(
  playerNames(process.env.PREVIEW_GAME_PLAYERS),
  inventorySource()
)
// The preview still works without a character or a plan: warn, do not fail the build
for (const warning of warnings) console.warn(`preview_prepare: ${warning}`)
console.log('preview_prepare: conta de teste pronta.')
await db.$disconnect()
