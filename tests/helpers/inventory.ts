import { db } from '@/lib/db'
import InventorySync from '@/services/game_sync/inventory_sync'
import { bitjitaSource, PLAYER_ONE, PLAYER_TWO } from './bitjita'

/** The two characters of the BitJita fixtures */
export function addBothPlayers() {
  return db.gamePlayer.createMany({ data: [PLAYER_ONE, PLAYER_TWO] })
}

/** Both characters, synced from the recorded answers */
export async function syncBothPlayers() {
  await addBothPlayers()
  return new InventorySync(bitjitaSource()).run('manual')
}

const itemId = async (kind: 'item' | 'cargo', gameId: number) =>
  (await db.item.findUniqueOrThrow({ where: { kind_gameId: { kind, gameId } } })).id

/** Total of an item across every container (the group's stock) */
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
