/**
 * Read-only client for the public BitJita API (https://bitjita.com/docs/api).
 * No token: the app never talks to the game servers. BitJita allows 250
 * requests per minute; this client stays far below (at most 2 per second).
 */

export const BITJITA_URL = 'https://bitjita.com'
export const USER_AGENT = 'bitcraft-companion'
const TIMEOUT_MS = 15_000
const MIN_INTERVAL_MS = 500

export class BitJitaError extends Error {}

/** 404: the player, house or claim does not exist (or has no data) */
export class NotFoundError extends BitJitaError {}

/** 429: BitJita asked us to slow down */
export class RateLimitedError extends BitJitaError {}

/** BitJita is down, slow, or answered something unexpected */
export class UpstreamError extends BitJitaError {}

/**
 * Spaces request starts by a minimum interval. One instance is shared by
 * every client in the process, so the button and the schedule add up.
 */
export class RequestThrottle {
  #next = 0

  constructor(
    private intervalMs: number,
    private now: () => number = () => Date.now(),
    private sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms))
  ) {}

  async wait() {
    const now = this.now()
    const start = Math.max(now, this.#next)
    this.#next = start + this.intervalMs
    if (start > now) await this.sleep(start - now)
  }
}

export const sharedThrottle = new RequestThrottle(MIN_INTERVAL_MS)

/* Response shapes, only the fields the app reads. BitJita sends 18-digit ids as strings. */

export interface PlayerSummary {
  entityId: string
  username: string
}

export interface PlayerClaim {
  entityId: string
  name: string
  isOwner?: boolean | null
  /** 1 or 0 per permission */
  memberPermissions?: {
    inventoryPermission?: number | null
    officerPermission?: number | null
    coOwnerPermission?: number | null
  } | null
  regionId?: number | null
  regionName?: string | null
}

export interface PlayerDetail {
  entityId: string
  username: string
  regionId?: number | null
  claims?: PlayerClaim[] | null
  /** Total XP per skill */
  experience?: { skill_id: number; quantity: number }[] | null
}

/** /api/players/{id}/traveler-tasks: the tasks the travelers give the player now */
export interface PlayerTravelerTask {
  /** traveler_task_desc id */
  taskId: number
  completed: boolean
}

/** /api/players/{id}/inventories: camelCase, itemType 0 = item, 1 = cargo */
export interface PlayerPocket {
  contents?: { itemId: number; itemType: number | string; quantity: number } | null
}

export interface PlayerInventory {
  entityId: string
  ownerEntityId?: string | null
  playerOwnerEntityId?: string | null
  inventoryName?: string | null
  buildingName?: string | null
  claimEntityId?: string | null
  claimName?: string | null
  regionId?: number | null
  pockets?: PlayerPocket[] | null
}

/** Claim and house storages: snake_case, item_type "item" or "cargo" */
export interface BuildingSlot {
  contents?: { item_id: number; item_type: string | number; quantity: number } | null
}

export interface BuildingInventory {
  entityId: string
  /** building_desc id: the kind of building */
  buildingDescriptionId?: number | null
  buildingName?: string | null
  buildingNickname?: string | null
  inventory?: BuildingSlot[] | null
}

export interface HouseSummary {
  buildingEntityId: string
  buildingName?: string | null
  claimEntityId?: string | null
  claimName?: string | null
}

export interface HouseDetail extends HouseSummary {
  inventories?: BuildingInventory[] | null
}

export interface BitJitaClientOptions {
  fetch?: typeof fetch
  baseUrl?: string
  timeoutMs?: number
  throttle?: RequestThrottle
}

export default class BitJitaClient {
  #fetch: typeof fetch
  #baseUrl: string
  #timeoutMs: number
  #throttle: RequestThrottle

  constructor(options: BitJitaClientOptions = {}) {
    this.#fetch = options.fetch ?? ((input, init) => fetch(input, init))
    this.#baseUrl = options.baseUrl ?? BITJITA_URL
    this.#timeoutMs = options.timeoutMs ?? TIMEOUT_MS
    this.#throttle = options.throttle ?? sharedThrottle
  }

  searchPlayers(query: string) {
    return this.get<{ players?: PlayerSummary[] | null }>(
      `/api/players?q=${encodeURIComponent(query)}`
    )
  }

  player(entityId: string) {
    return this.get<{ player: PlayerDetail }>(`/api/players/${encodeURIComponent(entityId)}`)
  }

  playerInventories(entityId: string) {
    return this.get<{ inventories?: PlayerInventory[] | null }>(
      `/api/players/${encodeURIComponent(entityId)}/inventories`
    )
  }

  playerTravelerTasks(entityId: string) {
    return this.get<{ tasks?: PlayerTravelerTask[] | null }>(
      `/api/players/${encodeURIComponent(entityId)}/traveler-tasks`
    )
  }

  /** 404 (NotFoundError) when the player has no house */
  playerHousing(entityId: string) {
    return this.get<HouseSummary[]>(`/api/players/${encodeURIComponent(entityId)}/housing`)
  }

  house(playerEntityId: string, houseEntityId: string) {
    return this.get<HouseDetail>(
      `/api/players/${encodeURIComponent(playerEntityId)}/housing/${encodeURIComponent(houseEntityId)}`
    )
  }

  claimInventories(claimEntityId: string) {
    return this.get<{ buildings?: BuildingInventory[] | null }>(
      `/api/claims/${encodeURIComponent(claimEntityId)}/inventories`
    )
  }

  async get<T>(path: string): Promise<T> {
    await this.#throttle.wait()

    let response: Response
    try {
      response = await this.#fetch(`${this.#baseUrl}${path}`, {
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(this.#timeoutMs),
      })
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError'
      throw new UpstreamError(
        timedOut
          ? `a BitJita não respondeu em ${Math.round(this.#timeoutMs / 1000)} s`
          : 'não foi possível conectar à BitJita',
        { cause: error }
      )
    }

    if (response.status === 404) throw new NotFoundError('não encontrado na BitJita')
    if (response.status === 429) {
      throw new RateLimitedError('a BitJita pediu para esperar (limite de requisições)')
    }
    if (!response.ok) throw new UpstreamError(`a BitJita respondeu ${response.status}`)

    try {
      return (await response.json()) as T
    } catch (error) {
      throw new UpstreamError('a BitJita respondeu algo que não é JSON', { cause: error })
    }
  }
}
