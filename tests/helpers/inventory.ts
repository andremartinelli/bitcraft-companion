import { db } from '@/lib/db'
import InventorySync from '@/services/game_sync/inventory_sync'
import { bitjitaSource, PLAYER_ONE, PLAYER_TWO } from './bitjita'

/**
 * The two characters of the BitJita fixtures, followed by an account: the
 * one given, or a new one. Returns who follows them and their ids.
 */
export async function addBothPlayers(userId?: number) {
  const follower =
    userId ?? (await db.user.create({ data: { email: 'seguidor@example.com', password: '-' } })).id
  const players = [
    await db.gamePlayer.create({ data: PLAYER_ONE }),
    await db.gamePlayer.create({ data: PLAYER_TWO }),
  ]
  await db.userGamePlayer.createMany({
    data: players.map((player) => ({ userId: follower, gamePlayerId: player.id })),
  })
  return { userId: follower, playerIds: players.map((player) => player.id) }
}

/** Both characters, followed and synced from the recorded answers */
export async function syncBothPlayers(userId?: number) {
  const { userId: follower, playerIds } = await addBothPlayers(userId)
  const run = await new InventorySync(bitjitaSource()).run('manual', {
    userId: follower,
    playerIds,
  })
  return { run, userId: follower, playerIds }
}

const itemId = async (kind: 'item' | 'cargo', gameId: number) =>
  (await db.item.findUniqueOrThrow({ where: { kind_gameId: { kind, gameId } } })).id

/** Total of an item across every container */
export async function groupTotal(kind: 'item' | 'cargo', gameId: number) {
  const { _sum } = await db.inventoryEntry.aggregate({
    where: { itemId: await itemId(kind, gameId) },
    _sum: { quantity: true },
  })
  return _sum.quantity ?? 0
}

/** Quantity of an item in a container (of a player, when names repeat) */
export async function quantityIn(
  containerName: string,
  kind: 'item' | 'cargo',
  gameId: number,
  playerEntityId?: string
) {
  const rows = await db.inventoryEntry.findMany({
    where: {
      itemId: await itemId(kind, gameId),
      container: {
        name: containerName,
        ...(playerEntityId && { gamePlayer: { entityId: playerEntityId } }),
      },
    },
    select: { quantity: true },
  })
  if (rows.length > 1) throw new Error(`"${containerName}" is ambiguous: pass the player`)
  return rows.length ? rows[0].quantity : null
}
