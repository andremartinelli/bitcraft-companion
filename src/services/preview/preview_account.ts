import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { PREVIEW_EMAIL } from '@/lib/preview'
import { followGamePlayer } from '@/models/game_player'
import { hashPassword } from '@/services/auth/password'
import type { InventorySource } from '@/services/game_sync/inventory_source'
import QuickPlans, { METAL_STYLES, type QuickPlanKey } from '@/services/plans/quick_plans'

/** Couro, Metal (both styles) and Casa, at the first tier the game data has */
const PLANS: { key: QuickPlanKey; styles: readonly (typeof METAL_STYLES)[number][] }[] = [
  { key: 'leather', styles: [METAL_STYLES[0]] },
  { key: 'metal', styles: METAL_STYLES },
  { key: 'homestead', styles: [METAL_STYLES[0]] },
]

/** "Catarrose, Veeto" → ["Catarrose", "Veeto"] */
export function playerNames(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
}

/**
 * Creates or refreshes the test account: no known password, following the
 * named characters (found on BitJita) and with its plans made again from
 * scratch, so every preview starts the same (src/lib/preview.ts). Returns what it could not do.
 */
export async function preparePreviewAccount(names: string[], source: InventorySource) {
  // Random and thrown away: nobody logs in with it, only /preview_session
  const password = await hashPassword(randomBytes(32).toString('base64url'))
  const user = await db.user.upsert({
    where: { email: PREVIEW_EMAIL },
    create: { email: PREVIEW_EMAIL, fullName: 'Conta de teste', password },
    update: { password },
    select: { id: true },
  })
  const warnings: string[] = []

  for (const name of names) {
    const found = await source.findPlayer(name).catch((error: Error) => {
      warnings.push(`BitJita falhou para ${name}: ${error.message}`)
      return undefined
    })
    if (found === null) warnings.push(`Nenhum personagem chamado "${name}" na BitJita.`)
    if (!found) continue
    const result = await followGamePlayer(user.id, found)
    // Already followed in an earlier build: nothing to do
    if (!result.ok && !result.error.includes('já está')) warnings.push(result.error)
  }

  await db.plan.deleteMany({ where: { createdById: user.id } })
  const quick = new QuickPlans()
  const catalog = await quick.catalog()
  for (const { key, styles } of PLANS) {
    const tier = catalog.find((entry) => entry.key === key)?.tiers[0]?.tier
    if (tier === undefined) {
      warnings.push(`Plano rápido "${key}" sem itens nos dados do jogo.`)
      continue
    }
    for (const style of styles) await quick.create(key, tier, style, user.id)
  }

  return { userId: user.id, warnings }
}
