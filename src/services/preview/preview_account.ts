import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { PREVIEW_EMAIL } from '@/lib/preview'
import { claimGamePlayer } from '@/models/game_player'
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

export const PREVIEW_GROUP = 'Grupo de teste'

/** "preview@example.com", then "preview+2@example.com" for the second character... */
const emailFor = (index: number) =>
  index === 0 ? PREVIEW_EMAIL : PREVIEW_EMAIL.replace('@', `+${index + 1}@`)

/** An account nobody logs in with: the password is random and thrown away */
async function upsertAccount(email: string, fullName: string) {
  const password = await hashPassword(randomBytes(32).toString('base64url'))
  return db.user.upsert({
    where: { email },
    create: { email, fullName, password },
    update: { fullName, password },
    select: { id: true },
  })
}

/**
 * Creates or refreshes the test account, so every preview starts the same
 * (src/lib/preview.ts): its character is the first one named (found on
 * BitJita); each of the others is the character of another test account, in
 * a group with it, and its plans are made again from scratch, shared with the
 * group. A plan then shows the inventory of several people. Returns what it could not do.
 */
export async function preparePreviewAccount(names: string[], source: InventorySource) {
  // Only /preview_session logs in with it
  const user = await upsertAccount(PREVIEW_EMAIL, 'Conta de teste')
  const warnings: string[] = []

  await db.group.deleteMany({ where: { ownerId: user.id } })
  const group = await db.group.create({
    data: {
      name: PREVIEW_GROUP,
      ownerId: user.id,
      members: { create: { userId: user.id, autoSharePlans: true } },
    },
  })

  for (const [index, name] of names.entries()) {
    const found = await source.findPlayer(name).catch((error: Error) => {
      warnings.push(`BitJita falhou para ${name}: ${error.message}`)
      return undefined
    })
    if (found === null) warnings.push(`Nenhum personagem chamado "${name}" na BitJita.`)
    if (!found) continue
    const account =
      index === 0 ? user : await upsertAccount(emailFor(index), `${found.username} (teste)`)
    await claimGamePlayer(account.id, found)
    if (account !== user) {
      await db.groupMember.create({ data: { groupId: group.id, userId: account.id } })
    }
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
