import type { Prisma } from '@/generated/prisma/client.ts'
import { db } from '@/lib/db'
import type { PlayerInfo } from '@/services/game_sync/inventory_source'

type Tx = Prisma.TransactionClient

/**
 * A game character, read from BitJita's public API by its entity id; no
 * player token is involved. Each account has one (users.game_player_id, "Meu
 * personagem"). A character exists once, even when two accounts say it is
 * theirs, so it is read from BitJita once.
 *
 * Before 25/11/2026 an account followed up to 5 (user_game_players). Those
 * rows stay only for an account that followed 2 or more to choose its own.
 */

/** The account's character; null when it has none */
export async function findAccountPlayer(userId: number) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { gamePlayer: true } })
  return user?.gamePlayer ?? null
}

/** Whose inventory an account sees outside a plan: its own character */
export async function accountPlayerIds(userId: number) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { gamePlayerId: true } })
  return user?.gamePlayerId ? [user.gamePlayerId] : []
}

/**
 * The characters of a plan's other people: its owner and whoever it is shared
 * with (one by one or "Todos do grupo"), each once
 */
export async function planPeoplePlayerIds(planId: number, userId: number) {
  const people = await db.user.findMany({
    where: {
      id: { not: userId },
      gamePlayerId: { not: null },
      OR: [
        { plansCreated: { some: { id: planId } } },
        { planShares: { some: { planId } } },
        { groupMembers: { some: { group: { planShares: { some: { planId } } } } } },
      ],
    },
    select: { gamePlayerId: true },
  })
  return [...new Set(people.map((person) => person.gamePlayerId!))]
}

/** The characters an account followed before "um personagem por conta", to choose its own */
export function listLegacyPlayers(userId: number) {
  return db.gamePlayer.findMany({
    where: { followers: { some: { userId } } },
    orderBy: [{ username: 'asc' }, { id: 'asc' }],
  })
}

/**
 * The account's character becomes `playerId` (null: none). Its old follows go,
 * and so does every character nobody has any more, with its places and items
 * (cascade): it is no longer read.
 */
async function setAccountPlayer(tx: Tx, userId: number, playerId: number | null) {
  const before = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { gamePlayerId: true },
  })
  const legacy = await tx.userGamePlayer.findMany({
    where: { userId },
    select: { gamePlayerId: true },
  })
  await tx.user.update({ where: { id: userId }, data: { gamePlayerId: playerId } })
  await tx.userGamePlayer.deleteMany({ where: { userId } })
  const left = [before.gamePlayerId, ...legacy.map((row) => row.gamePlayerId)].filter(
    (id): id is number => id !== null && id !== playerId
  )
  await tx.gamePlayer.deleteMany({
    where: { id: { in: left }, accounts: { none: {} }, followers: { none: {} } },
  })
}

/**
 * A character found on BitJita becomes the account's. It is created the
 * first time any account has it.
 */
export function claimGamePlayer(userId: number, found: PlayerInfo) {
  return db.$transaction(async (tx) => {
    const player = await tx.gamePlayer.upsert({
      where: { entityId: found.entityId },
      create: {
        username: found.username,
        entityId: found.entityId,
        regionId: found.regionId,
        claims: found.claims,
      },
      update: {},
    })
    await setAccountPlayer(tx, userId, player.id)
    return player
  })
}

/**
 * An account that followed several characters chooses its own among them
 * ("É o meu"); the others leave its list. Null when it did not follow it.
 */
export function chooseLegacyPlayer(userId: number, gamePlayerId: number) {
  return db.$transaction(async (tx) => {
    const follow = await tx.userGamePlayer.findUnique({
      where: { userId_gamePlayerId: { userId, gamePlayerId } },
      select: { gamePlayer: { select: { username: true } } },
    })
    if (!follow) return null
    await setAccountPlayer(tx, userId, gamePlayerId)
    return follow.gamePlayer
  })
}

/**
 * The account has no character any more: its items leave the app (nothing
 * changes in the game, nor for another account that has the same character).
 * Null when it had none.
 */
export function releaseGamePlayer(userId: number) {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { gamePlayer: { select: { username: true } } },
    })
    await setAccountPlayer(tx, userId, null)
    return user.gamePlayer
  })
}

/** "Vila A, Vila B", as of the last read */
export function claimNames(claims: unknown) {
  if (!Array.isArray(claims)) return ''
  return claims
    .map((claim) =>
      claim && typeof claim === 'object' ? (claim as { name?: unknown }).name : null
    )
    .filter((name): name is string => typeof name === 'string' && name !== '')
    .join(', ')
}
