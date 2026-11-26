import { db } from '@/lib/db'
import { playerClaims } from '@/models/game_player'

/**
 * The claims whose chests count toward an account's inventory (counted_claims,
 * "Meu personagem"). Only claims the account's character belongs to, as of its
 * last read: a claim it left stops counting without anyone touching the row.
 */

/** The claims these accounts count, each once */
export async function countedClaims(userIds: number[]) {
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    orderBy: { id: 'asc' },
    select: {
      countedClaims: { select: { claimEntityId: true } },
      gamePlayer: { select: { claims: true } },
    },
  })
  const claims = new Map<string, { entityId: string; name: string }>()
  for (const user of users) {
    const counted = new Set(user.countedClaims.map((c) => c.claimEntityId))
    for (const claim of playerClaims(user.gamePlayer?.claims)) {
      if (counted.has(claim.entityId)) claims.set(claim.entityId, claim)
    }
  }
  return [...claims.values()]
}

/** Every claim some account counts while its character still belongs to it: the chests to keep */
export async function allCountedClaimIds() {
  const accounts = await db.countedClaim.findMany({ distinct: ['userId'], select: { userId: true } })
  return (await countedClaims(accounts.map((account) => account.userId))).map((c) => c.entityId)
}

/** The claims each of these characters' accounts count: what the sync reads */
export async function claimsToRead(playerIds: number[]) {
  const rows = await db.countedClaim.findMany({
    where: { user: { gamePlayerId: { in: playerIds } } },
    select: { claimEntityId: true, user: { select: { gamePlayerId: true } } },
  })
  const byPlayer = new Map<number, Set<string>>()
  for (const { claimEntityId, user } of rows) {
    const ids = byPlayer.get(user.gamePlayerId!) ?? new Set<string>()
    byPlayer.set(user.gamePlayerId!, ids.add(claimEntityId))
  }
  return byPlayer
}

/** The account's character's claims, each with whether the account counts it */
export async function accountClaims(userId: number) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      countedClaims: { select: { claimEntityId: true } },
      gamePlayer: { select: { claims: true } },
    },
  })
  const counted = new Set(user.countedClaims.map((c) => c.claimEntityId))
  return playerClaims(user.gamePlayer?.claims).map((claim) => ({
    ...claim,
    counted: counted.has(claim.entityId),
  }))
}

/**
 * Switches a claim on or off for the account. Only a claim of its character:
 * anything else would read another settlement's chests. On: the character is
 * read again on the next page that shows the inventory. Off: the chests leave
 * the app once no account counts the claim.
 * @returns false when the claim is not the character's
 */
export async function saveCountedClaim(userId: number, claimEntityId: string, counted: boolean) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { gamePlayer: { select: { id: true, claims: true } } },
  })
  const player = user.gamePlayer
  if (!player || !playerClaims(player.claims).some((c) => c.entityId === claimEntityId)) {
    return false
  }

  const key = { userId_claimEntityId: { userId, claimEntityId } }
  if (counted) {
    await db.$transaction([
      db.countedClaim.upsert({ where: key, create: { userId, claimEntityId }, update: {} }),
      db.gamePlayer.update({ where: { id: player.id }, data: { lastAttemptAt: null } }),
    ])
  } else {
    await db.$transaction(async (tx) => {
      await tx.countedClaim.deleteMany({ where: { userId, claimEntityId } })
      if (await tx.countedClaim.count({ where: { claimEntityId } })) return
      await tx.inventoryContainer.deleteMany({ where: { kind: 'claim', claimEntityId } })
    })
  }
  return true
}
