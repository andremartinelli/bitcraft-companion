import { Prisma } from '@/generated/prisma/client.ts'
import { db } from '@/lib/db'
import type { PlayerInfo } from '@/services/game_sync/inventory_source'

/**
 * A game character whose inventories the app follows. Identified by the
 * public entity id from BitJita; no player token is involved. A character
 * exists once, however many accounts follow it (user_game_players), so it is
 * read from BitJita once.
 */

/** Each account follows at most this many characters: the free plans are small */
export const MAX_PLAYERS_PER_USER = 5

/** The characters an account follows, by name */
export function listGamePlayers(userId: number) {
  return db.gamePlayer.findMany({
    where: { followers: { some: { userId } } },
    orderBy: [{ username: 'asc' }, { id: 'asc' }],
  })
}

/** The ids of the characters an account follows */
export async function followedPlayerIds(userId: number) {
  const rows = await db.userGamePlayer.findMany({
    where: { userId },
    select: { gamePlayerId: true },
  })
  return rows.map((row) => row.gamePlayerId)
}

export function followCount(userId: number) {
  return db.userGamePlayer.count({ where: { userId } })
}

export type FollowResult = { ok: true; username: string } | { ok: false; error: string }

/**
 * The account starts following a character found on BitJita. The character
 * is created the first time anyone follows it.
 */
export async function followGamePlayer(userId: number, found: PlayerInfo): Promise<FollowResult> {
  try {
    return await db.$transaction(async (tx) => {
      if ((await tx.userGamePlayer.count({ where: { userId } })) >= MAX_PLAYERS_PER_USER) {
        return {
          ok: false as const,
          error: `Cada conta acompanha no máximo ${MAX_PLAYERS_PER_USER} personagens.`,
        }
      }
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
      const already = await tx.userGamePlayer.findUnique({
        where: { userId_gamePlayerId: { userId, gamePlayerId: player.id } },
      })
      if (already) {
        return { ok: false as const, error: `${player.username} já está na sua lista.` }
      }
      await tx.userGamePlayer.create({ data: { userId, gamePlayerId: player.id } })
      return { ok: true as const, username: player.username }
    })
  } catch (error) {
    // Added at the same moment, in another tab
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { ok: false, error: `${found.username} já está na sua lista.` }
    }
    throw error
  }
}

/**
 * The account stops following a character. When nobody follows it any more,
 * the character goes too, with its places and items (cascade), and is no
 * longer read. Null when the account did not follow it.
 */
export async function unfollowGamePlayer(userId: number, gamePlayerId: number) {
  return db.$transaction(async (tx) => {
    const follow = await tx.userGamePlayer.findUnique({
      where: { userId_gamePlayerId: { userId, gamePlayerId } },
      select: { gamePlayer: { select: { username: true } } },
    })
    if (!follow) return null
    await tx.userGamePlayer.delete({
      where: { userId_gamePlayerId: { userId, gamePlayerId } },
    })
    await tx.gamePlayer.deleteMany({ where: { id: gamePlayerId, followers: { none: {} } } })
    return follow.gamePlayer
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
