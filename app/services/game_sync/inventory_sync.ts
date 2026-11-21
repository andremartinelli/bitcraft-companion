import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { DatabaseQueryBuilderContract } from '@adonisjs/lucid/types/querybuilder'
import { DateTime } from 'luxon'
import GamePlayer from '#models/game_player'
import InventoryContainer from '#models/inventory_container'
import SyncRun, { type SyncStatus, type SyncTrigger } from '#models/sync_run'
import { itemKey, type ItemKey } from '#services/game_data/transform'
import { RateLimitedError } from '#services/game_sync/bitjita_client'
import type {
  ContainerSnapshot,
  InventorySource,
  StackRef,
} from '#services/game_sync/inventory_source'

export class SyncAlreadyRunningError extends Error {
  constructor() {
    super('Já existe uma sincronização em andamento.')
  }
}

export interface SyncCounts extends Record<string, number> {
  players: number
  playersTotal: number
  claims: number
  claimsTotal: number
  containers: number
  entries: number
  unknownItems: number
}

interface Outcome {
  status: Exclude<SyncStatus, 'running'>
  message: string | null
  counts: SyncCounts
}

interface Written {
  containers: number
  entries: number
}

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * Reads every tracked player's inventories (and their claims' chests) from
 * the source and replaces the stored snapshot. Each player and each claim is
 * written in its own transaction: when a read fails, the previous data of
 * that player or claim stays.
 */
export default class InventorySync {
  static #running = false

  /** True while a sync runs in this process */
  static get running() {
    return this.#running
  }

  constructor(private source: InventorySource) {}

  /** @throws SyncAlreadyRunningError when another sync is in progress */
  async run(trigger: SyncTrigger): Promise<SyncRun> {
    if (InventorySync.#running) throw new SyncAlreadyRunningError()
    InventorySync.#running = true
    try {
      // The ace command runs in its own process: the table is the shared lock
      if (await SyncRun.inProgress()) throw new SyncAlreadyRunningError()

      const run = await SyncRun.create({
        trigger,
        source: this.source.name,
        status: 'running',
        startedAt: DateTime.now(),
      })
      try {
        const outcome = await this.#sync()
        run.merge({ ...outcome, finishedAt: DateTime.now() })
      } catch (error) {
        run.merge({
          status: 'failed',
          message: `Erro inesperado: ${describe(error)}`,
          finishedAt: DateTime.now(),
        })
        await run.save()
        throw error
      }
      await run.save()
      return run
    } finally {
      InventorySync.#running = false
    }
  }

  async #sync(): Promise<Outcome> {
    const counts: SyncCounts = {
      players: 0,
      playersTotal: 0,
      claims: 0,
      claimsTotal: 0,
      containers: 0,
      entries: 0,
      unknownItems: 0,
    }
    const players = await GamePlayer.query().orderBy('id')
    counts.playersTotal = players.length
    if (!players.length) {
      return {
        status: 'failed',
        message: 'Nenhum personagem cadastrado: adicione os personagens antes de sincronizar.',
        counts,
      }
    }

    const itemIds = await this.#itemIds()
    const unknown = new Set<ItemKey>()
    const problems: string[] = []
    // A 429 stops every further call: retrying right away only makes it worse
    let stoppedBy: string | null = null
    let everyPlayerRead = true
    const claims = new Map<string, string>()

    for (const player of players) {
      if (stoppedBy) {
        everyPlayerRead = false
        problems.push(`${player.username}: não lido (${stoppedBy}).`)
        continue
      }
      try {
        const snapshot = await this.source.fetchPlayer(player.entityId)
        const written = await this.#replacePlayer(player, snapshot, itemIds, unknown)
        counts.players++
        counts.containers += written.containers
        counts.entries += written.entries
        for (const claim of snapshot.player.claims) claims.set(claim.entityId, claim.name)
      } catch (error) {
        everyPlayerRead = false
        problems.push(`${player.username}: não foi possível ler (${describe(error)}).`)
        player.lastError = describe(error)
        await player.save()
        if (error instanceof RateLimitedError) stoppedBy = describe(error)
      }
    }

    // A claim shared by several players is read once
    counts.claimsTotal = claims.size
    for (const [claimId, claimName] of claims) {
      if (stoppedBy) {
        problems.push(`Claim ${claimName}: não lida (${stoppedBy}).`)
        continue
      }
      try {
        const snapshot = await this.source.fetchClaim(claimId)
        const written = await this.#replaceClaim(
          claimId,
          claimName,
          snapshot.containers,
          itemIds,
          unknown
        )
        counts.claims++
        counts.containers += written.containers
        counts.entries += written.entries
      } catch (error) {
        problems.push(`Claim ${claimName}: não foi possível ler (${describe(error)}).`)
        if (error instanceof RateLimitedError) stoppedBy = describe(error)
      }
    }

    // Chests of claims nobody belongs to anymore. Only when every player was
    // read: a player that failed may still belong to the claim.
    if (everyPlayerRead) await this.#dropOtherClaims([...claims.keys()])

    counts.unknownItems = unknown.size
    const notes = [...problems]
    if (unknown.size) {
      notes.push(
        `${unknown.size} ${unknown.size === 1 ? 'item desconhecido foi ignorado' : 'itens desconhecidos foram ignorados'}: rode node ace bitcraft:import para atualizar os dados do jogo.`
      )
    }

    const status: Outcome['status'] = !problems.length
      ? 'ok'
      : counts.players === 0
        ? 'failed'
        : 'partial'
    return { status, message: notes.length ? notes.join('\n') : null, counts }
  }

  async #itemIds() {
    const rows: { id: number; kind: 'item' | 'cargo'; game_id: number }[] = await db
      .from('items')
      .select('id', 'kind', 'game_id')
    return new Map<ItemKey, number>(rows.map((row) => [itemKey(row.kind, row.game_id), row.id]))
  }

  #replacePlayer(
    player: GamePlayer,
    snapshot: Awaited<ReturnType<InventorySource['fetchPlayer']>>,
    itemIds: Map<ItemKey, number>,
    unknown: Set<ItemKey>
  ): Promise<Written> {
    return db.transaction(async (trx) => {
      const now = DateTime.now()
      const written: Written = { containers: 0, entries: 0 }
      const keep: number[] = []
      for (const snap of snapshot.containers) {
        const container = await this.#upsertContainer(trx, snap, player.id, snap.claim?.name, now)
        keep.push(container.id)
        written.containers++
        written.entries += await this.#replaceEntries(
          trx,
          container.id,
          snap.items,
          itemIds,
          unknown
        )
      }
      await this.#dropContainers(
        trx,
        trx.from('inventory_containers').where('game_player_id', player.id).whereNotIn('id', keep)
      )

      player.useTransaction(trx)
      player.merge({
        username: snapshot.player.username,
        regionId: snapshot.player.regionId,
        claims: snapshot.player.claims,
        lastSyncedAt: now,
        lastError: null,
      })
      await player.save()
      return written
    })
  }

  #replaceClaim(
    claimId: string,
    claimName: string,
    containers: ContainerSnapshot[],
    itemIds: Map<ItemKey, number>,
    unknown: Set<ItemKey>
  ): Promise<Written> {
    return db.transaction(async (trx) => {
      const now = DateTime.now()
      const written: Written = { containers: 0, entries: 0 }
      const keep: number[] = []
      for (const snap of containers) {
        const container = await this.#upsertContainer(trx, snap, null, claimName, now)
        keep.push(container.id)
        written.containers++
        written.entries += await this.#replaceEntries(
          trx,
          container.id,
          snap.items,
          itemIds,
          unknown
        )
      }
      await this.#dropContainers(
        trx,
        trx
          .from('inventory_containers')
          .where('kind', 'claim')
          .where('claim_entity_id', claimId)
          .whereNotIn('id', keep)
      )
      return written
    })
  }

  async #dropOtherClaims(claimIds: string[]) {
    await db.transaction(async (trx) => {
      await this.#dropContainers(
        trx,
        trx
          .from('inventory_containers')
          .where('kind', 'claim')
          .where((q) => q.whereNull('claim_entity_id').orWhereNotIn('claim_entity_id', claimIds))
      )
    })
  }

  #upsertContainer(
    trx: TransactionClientContract,
    snap: ContainerSnapshot,
    gamePlayerId: number | null,
    claimName: string | null | undefined,
    now: DateTime
  ) {
    return InventoryContainer.updateOrCreate(
      { kind: snap.kind, gameEntityId: snap.gameEntityId },
      {
        gamePlayerId,
        name: snap.name,
        claimEntityId: snap.claim?.entityId ?? null,
        claimName: claimName ?? snap.claim?.name ?? null,
        lastSeenAt: now,
      },
      { client: trx }
    )
  }

  /** Deletes the containers the query selects, entries first */
  async #dropContainers(trx: TransactionClientContract, query: DatabaseQueryBuilderContract) {
    const rows = await query.select('id')
    const ids: number[] = rows.map((row) => row.id)
    if (!ids.length) return
    await trx.from('inventory_entries').whereIn('container_id', ids).delete()
    await trx.from('inventory_containers').whereIn('id', ids).delete()
  }

  /** Replaces the synced entries of a container; pockets with the same item are summed */
  async #replaceEntries(
    trx: TransactionClientContract,
    containerId: number,
    stacks: StackRef[],
    itemIds: Map<ItemKey, number>,
    unknown: Set<ItemKey>
  ) {
    await trx
      .from('inventory_entries')
      .where('container_id', containerId)
      .where('source', 'sync')
      .delete()

    const totals = new Map<number, number>()
    for (const stack of stacks) {
      const key = itemKey(stack.kind, stack.gameId)
      const itemId = itemIds.get(key)
      if (itemId === undefined) {
        unknown.add(key)
        continue
      }
      totals.set(itemId, (totals.get(itemId) ?? 0) + stack.quantity)
    }
    if (!totals.size) return 0

    const syncedAt = DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss')
    await trx
      .insertQuery()
      .table('inventory_entries')
      .multiInsert(
        [...totals].map(([itemId, quantity]) => ({
          container_id: containerId,
          item_id: itemId,
          quantity,
          source: 'sync',
          synced_at: syncedAt,
        }))
      )
    return totals.size
  }
}
