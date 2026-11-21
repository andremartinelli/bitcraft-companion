import type { ContainerKind } from '#models/inventory_container'
import type { ItemKind } from '#models/item'
import BitJitaClient, {
  NotFoundError,
  type BuildingSlot,
  type HouseSummary,
  type PlayerDetail,
  type PlayerInventory,
  type PlayerPocket,
} from '#services/game_sync/bitjita_client'

export interface StackRef {
  kind: ItemKind
  gameId: number
  quantity: number
}

export interface ClaimRef {
  entityId: string
  name: string | null
}

export interface ContainerSnapshot {
  kind: ContainerKind
  /** entityId of the inventory (player) or of the building (claim, house) */
  gameEntityId: string
  name: string
  claim: ClaimRef | null
  /** One entry per occupied pocket: the same item may appear more than once */
  items: StackRef[]
}

export interface PlayerInfo {
  entityId: string
  username: string
  regionId: number | null
  claims: { entityId: string; name: string }[]
}

export interface PlayerSnapshot {
  player: PlayerInfo
  containers: ContainerSnapshot[]
}

export interface ClaimSnapshot {
  entityId: string
  containers: ContainerSnapshot[]
}

/**
 * Where inventories come from. Today only BitJita (public data, no token);
 * an official source with a Developer Program token can implement the same.
 */
export interface InventorySource {
  readonly name: string
  /** Exact nick, ignoring case. Null when there is no such player. */
  findPlayer(username: string): Promise<PlayerInfo | null>
  /** Personal inventories, bank, stash, carts and house */
  fetchPlayer(entityId: string): Promise<PlayerSnapshot>
  /** The claim's chests, shared by its members */
  fetchClaim(claimEntityId: string): Promise<ClaimSnapshot>
}

const PERSONAL: Record<string, { kind: ContainerKind; name: string }> = {
  Inventory: { kind: 'personal', name: 'Mochila' },
  Toolbelt: { kind: 'toolbelt', name: 'Cinto' },
  Wallet: { kind: 'wallet', name: 'Carteira' },
}

/**
 * Kind and display name of an inventory from /api/players/{id}/inventories.
 * Checked against real responses (21/11/2026):
 * - "Inventory", "Toolbelt", "Wallet": owned by the player;
 * - the Settlement Stash has inventoryName and buildingName "Settlement Stash";
 * - the bank has no name at all and ownerEntityId "0";
 * - carts and personal caches are named "<Nick>'s Cart (II)" and owned by
 *   themselves (ownerEntityId = entityId).
 */
export function classifyInventory(
  inventory: PlayerInventory,
  playerEntityId: string
): { kind: ContainerKind; name: string } {
  const inventoryName = inventory.inventoryName?.trim() || null
  const buildingName = inventory.buildingName?.trim() || null
  const ownedByPlayer = inventory.ownerEntityId === playerEntityId

  if (inventoryName && PERSONAL[inventoryName]) return PERSONAL[inventoryName]
  if (buildingName?.includes('Stash')) return { kind: 'stash', name: buildingName }
  if (!inventoryName && !buildingName && !ownedByPlayer) return { kind: 'bank', name: 'Banco' }
  if (inventoryName && !ownedByPlayer) return { kind: 'deployable', name: inventoryName }
  return { kind: 'other', name: inventoryName ?? buildingName ?? 'Inventário' }
}

/**
 * BitJita uses two formats for the same thing: 0/1 in player inventories,
 * "item"/"cargo" in claims and houses. Both are accepted everywhere.
 */
function toStack(gameId: unknown, type: unknown, quantity: unknown): StackRef | null {
  const kind: ItemKind | null =
    type === 0 || type === 'item' ? 'item' : type === 1 || type === 'cargo' ? 'cargo' : null
  const id = Number(gameId)
  const amount = Number(quantity)
  if (!kind || !Number.isInteger(id) || !(amount > 0)) return null
  return { kind, gameId: id, quantity: amount }
}

/** Player inventories: contents.itemId / contents.itemType (0 = item, 1 = cargo) */
export function stacksFromPockets(pockets: PlayerPocket[] | null | undefined): StackRef[] {
  return (pockets ?? []).flatMap(({ contents }) => {
    const stack = contents ? toStack(contents.itemId, contents.itemType, contents.quantity) : null
    return stack ? [stack] : []
  })
}

/** Claims and houses: contents.item_id / contents.item_type ("item" or "cargo") */
export function stacksFromSlots(slots: BuildingSlot[] | null | undefined): StackRef[] {
  return (slots ?? []).flatMap(({ contents }) => {
    const stack = contents ? toStack(contents.item_id, contents.item_type, contents.quantity) : null
    return stack ? [stack] : []
  })
}

function toPlayerInfo(player: PlayerDetail): PlayerInfo {
  return {
    entityId: String(player.entityId),
    username: player.username,
    regionId: player.regionId ?? null,
    claims: (player.claims ?? []).map((claim) => ({
      entityId: String(claim.entityId),
      name: claim.name,
    })),
  }
}

export class BitJitaInventorySource implements InventorySource {
  readonly name = 'bitjita'

  constructor(private client: BitJitaClient = new BitJitaClient()) {}

  async findPlayer(username: string): Promise<PlayerInfo | null> {
    const wanted = username.trim().toLowerCase()
    if (!wanted) return null
    const { players } = await this.client.searchPlayers(username.trim())
    const match = (players ?? []).find((p) => p.username.toLowerCase() === wanted)
    if (!match) return null
    const { player } = await this.client.player(String(match.entityId))
    return toPlayerInfo(player)
  }

  async fetchPlayer(entityId: string): Promise<PlayerSnapshot> {
    const { player } = await this.client.player(entityId)
    const { inventories } = await this.client.playerInventories(entityId)

    const containers: ContainerSnapshot[] = (inventories ?? []).map((inventory) => ({
      ...classifyInventory(inventory, entityId),
      gameEntityId: String(inventory.entityId),
      claim: inventory.claimEntityId
        ? { entityId: String(inventory.claimEntityId), name: inventory.claimName ?? null }
        : null,
      items: stacksFromPockets(inventory.pockets),
    }))

    for (const house of await this.#houses(entityId)) {
      const detail = await this.client.house(entityId, String(house.buildingEntityId))
      for (const storage of detail.inventories ?? []) {
        containers.push({
          kind: 'housing',
          gameEntityId: String(storage.entityId),
          name: storage.buildingNickname?.trim() || storage.buildingName?.trim() || 'Casa',
          claim: house.claimEntityId
            ? { entityId: String(house.claimEntityId), name: house.claimName ?? null }
            : null,
          items: stacksFromSlots(storage.inventory),
        })
      }
    }

    return { player: toPlayerInfo(player), containers }
  }

  async fetchClaim(claimEntityId: string): Promise<ClaimSnapshot> {
    const { buildings } = await this.client.claimInventories(claimEntityId)
    return {
      entityId: claimEntityId,
      containers: (buildings ?? []).map((building) => ({
        kind: 'claim' as const,
        gameEntityId: String(building.entityId),
        name: building.buildingNickname?.trim() || building.buildingName?.trim() || 'Baú',
        claim: { entityId: claimEntityId, name: null },
        items: stacksFromSlots(building.inventory),
      })),
    }
  }

  /** A player without a house gets a 404 */
  async #houses(entityId: string): Promise<HouseSummary[]> {
    try {
      const houses = await this.client.playerHousing(entityId)
      return Array.isArray(houses) ? houses : []
    } catch (error) {
      if (error instanceof NotFoundError) return []
      throw error
    }
  }
}
