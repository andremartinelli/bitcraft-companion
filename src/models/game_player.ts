import { db } from '@/lib/db'
import type { PlayerInfo } from '@/services/game_sync/inventory_source'

/**
 * A game character whose inventories the app follows. Identified by the
 * public entity id from BitJita; no player token is involved.
 */

export function listGamePlayers() {
  return db.gamePlayer.findMany({ orderBy: [{ username: 'asc' }, { id: 'asc' }] })
}

export function findGamePlayerByEntityId(entityId: string) {
  return db.gamePlayer.findUnique({ where: { entityId } })
}

/** A character found on BitJita. Throws P2002 when it is already on the list */
export function insertGamePlayer(found: PlayerInfo) {
  return db.gamePlayer.create({
    data: {
      username: found.username,
      entityId: found.entityId,
      regionId: found.regionId,
      claims: found.claims,
    },
  })
}

/** Its places and their items go with it (cascade). Null when it was already gone */
export async function deleteGamePlayer(id: number) {
  const player = await db.gamePlayer.findUnique({ where: { id }, select: { username: true } })
  if (!player) return null
  await db.gamePlayer.deleteMany({ where: { id } })
  return player
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
