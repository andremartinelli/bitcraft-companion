import {
  Prisma,
  type SyncRun,
  type SyncStatus,
  type SyncTrigger,
} from '@/generated/prisma/client.ts'
import { db } from '@/lib/db'
import { closeAbandonedRuns } from '@/models/sync_run'
import { itemKey, type ItemKey } from '@/services/game_data/transform'
import { RateLimitedError } from '@/services/game_sync/bitjita_client'
import type {
  ContainerSnapshot,
  InventorySource,
  PlayerSnapshot,
  StackRef,
} from '@/services/game_sync/inventory_source'

type Tx = Prisma.TransactionClient

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

/** What the "Sincronizar agora" button says when it is done */
export const SYNC_RESULTS: Record<Exclude<SyncStatus, 'running'>, string> = {
  ok: 'Sincronização concluída.',
  partial: 'Sincronização parcial: veja os avisos abaixo.',
  failed: 'A sincronização falhou. Os dados anteriores foram mantidos.',
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

/** A player's writes go in one transaction: a few dozen statements */
const TRANSACTION = { timeout: 30_000, maxWait: 10_000 }

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error))

export interface SyncOptions {
  /**
   * Read the chests of the players' claims. Off: the group has no access to
   * the settlement's chests (decided 21/11/2026), so they would only inflate
   * the stock. The Settlement Stash is each player's own and is always read.
   */
  readClaims?: boolean
}

/** Whose characters a run reads */
export interface SyncScope {
  /** The account that asked (the button, a page); none for the cron */
  userId?: number | null
  /** These characters; without it, every character someone follows */
  playerIds?: number[]
}

/**
 * Reads the inventories of the characters in the scope (and, when asked,
 * their claims' chests) from the source and replaces the stored snapshot. Each player and
 * each claim is written in its own transaction: when a read fails, the
 * previous data of that player or claim stays.
 *
 * Only one sync runs at a time, across every Vercel instance: the run is a
 * sync_runs row with status "running", and the database refuses a second one.
 */
export default class InventorySync {
  constructor(
    private source: InventorySource,
    private options: SyncOptions = {}
  ) {}

  /** @throws SyncAlreadyRunningError when another sync is in progress */
  async run(trigger: SyncTrigger, scope: SyncScope = {}): Promise<SyncRun> {
    await closeAbandonedRuns()
    let run: SyncRun
    try {
      run = await db.syncRun.create({
        data: {
          trigger,
          source: this.source.name,
          status: 'running',
          userId: scope.userId ?? null,
          startedAt: new Date(),
        },
      })
    } catch (error) {
      // sync_runs_one_running: another run holds the lock
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new SyncAlreadyRunningError()
      }
      throw error
    }

    let outcome: Outcome
    try {
      outcome = await this.#sync(scope)
    } catch (error) {
      await db.syncRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          message: `Erro inesperado: ${describe(error)}`,
          finishedAt: new Date(),
        },
      })
      throw error
    }
    return db.syncRun.update({
      where: { id: run.id },
      data: { ...outcome, finishedAt: new Date() },
    })
  }

  async #sync(scope: SyncScope): Promise<Outcome> {
    const counts: SyncCounts = {
      players: 0,
      playersTotal: 0,
      claims: 0,
      claimsTotal: 0,
      containers: 0,
      entries: 0,
      unknownItems: 0,
    }
    const players = await db.gamePlayer.findMany({
      where: scope.playerIds ? { id: { in: scope.playerIds } } : { followers: { some: {} } },
      orderBy: { id: 'asc' },
      select: { id: true, username: true, entityId: true },
    })
    counts.playersTotal = players.length
    if (!players.length) {
      return {
        status: 'failed',
        message: 'Nenhum personagem na lista: adicione os seus personagens antes de sincronizar.',
        counts,
      }
    }

    const unknown = new Set<ItemKey>()
    const problems: string[] = []
    // A 429 stops every further call: retrying right away only makes it worse
    let stoppedBy: string | null = null
    let everyPlayerRead = true
    const claims = new Map<string, string>()

    for (const player of players) {
      // Read or not, it was tried now: the pages don't ask again for a while
      await db.gamePlayer.update({ where: { id: player.id }, data: { lastAttemptAt: new Date() } })
      if (stoppedBy) {
        everyPlayerRead = false
        problems.push(`${player.username}: não lido (${stoppedBy}).`)
        continue
      }
      try {
        const snapshot = await this.source.fetchPlayer(player.entityId)
        const written = await this.#replacePlayer(player.id, snapshot, unknown)
        counts.players++
        counts.containers += written.containers
        counts.entries += written.entries
        for (const claim of snapshot.player.claims) claims.set(claim.entityId, claim.name)
      } catch (error) {
        everyPlayerRead = false
        problems.push(`${player.username}: não foi possível ler (${describe(error)}).`)
        await db.gamePlayer.update({
          where: { id: player.id },
          data: { lastError: describe(error) },
        })
        if (error instanceof RateLimitedError) stoppedBy = describe(error)
      }
    }

    if (this.options.readClaims) {
      // A claim shared by several players is read once
      counts.claimsTotal = claims.size
      for (const [claimId, claimName] of claims) {
        if (stoppedBy) {
          problems.push(`Claim ${claimName}: não lida (${stoppedBy}).`)
          continue
        }
        try {
          const snapshot = await this.source.fetchClaim(claimId)
          const written = await this.#replaceClaim(claimId, claimName, snapshot.containers, unknown)
          counts.claims++
          counts.containers += written.containers
          counts.entries += written.entries
        } catch (error) {
          problems.push(`Claim ${claimName}: não foi possível ler (${describe(error)}).`)
          if (error instanceof RateLimitedError) stoppedBy = describe(error)
        }
      }

      // Chests of claims nobody belongs to anymore. Only when every player was
      // read (all of them, not one account's): a player that failed or was not
      // read may still belong to the claim.
      if (everyPlayerRead && !scope.playerIds) await dropOtherClaims(db, [...claims.keys()])
    } else {
      // Claim chests are not read: none may stay from an earlier sync
      await dropOtherClaims(db, [])
    }

    counts.unknownItems = unknown.size
    const notes = [...problems]
    if (unknown.size) {
      notes.push(
        `${unknown.size} ${unknown.size === 1 ? 'item desconhecido foi ignorado' : 'itens desconhecidos foram ignorados'}: rode npm run game-data:import para atualizar os dados do jogo.`
      )
    }

    const status: Outcome['status'] = !problems.length
      ? 'ok'
      : counts.players === 0
        ? 'failed'
        : 'partial'
    return { status, message: notes.length ? notes.join('\n') : null, counts }
  }

  async #replacePlayer(
    playerId: number,
    snapshot: PlayerSnapshot,
    unknown: Set<ItemKey>
  ): Promise<Written> {
    const itemIds = await itemIdsOf(snapshot.containers)
    return db.$transaction(async (tx) => {
      const now = new Date()
      const written: Written = { containers: 0, entries: 0 }
      const keep: number[] = []
      for (const snap of snapshot.containers) {
        const id = await upsertContainer(tx, snap, playerId, snap.claim?.name ?? null, now)
        keep.push(id)
        written.containers++
        written.entries += await replaceEntries(tx, id, snap.items, itemIds, unknown, now)
      }
      // Entries go with their containers (cascade)
      await tx.inventoryContainer.deleteMany({
        where: { gamePlayerId: playerId, id: { notIn: keep } },
      })
      await tx.gamePlayer.update({
        where: { id: playerId },
        data: {
          username: snapshot.player.username,
          regionId: snapshot.player.regionId,
          claims: snapshot.player.claims,
          lastSyncedAt: now,
          lastError: null,
        },
      })
      return written
    }, TRANSACTION)
  }

  async #replaceClaim(
    claimId: string,
    claimName: string,
    containers: ContainerSnapshot[],
    unknown: Set<ItemKey>
  ): Promise<Written> {
    const itemIds = await itemIdsOf(containers)
    return db.$transaction(async (tx) => {
      const now = new Date()
      const written: Written = { containers: 0, entries: 0 }
      const keep: number[] = []
      for (const snap of containers) {
        const id = await upsertContainer(tx, snap, null, claimName, now)
        keep.push(id)
        written.containers++
        written.entries += await replaceEntries(tx, id, snap.items, itemIds, unknown, now)
      }
      await tx.inventoryContainer.deleteMany({
        where: { kind: 'claim', claimEntityId: claimId, id: { notIn: keep } },
      })
      return written
    }, TRANSACTION)
  }
}

/** Our ids of the items in these containers, by kind and game id (also items that left the game) */
async function itemIdsOf(containers: ContainerSnapshot[]) {
  const stacks: StackRef[] = containers.flatMap((container) => container.items)
  const gameIds = (kind: StackRef['kind']) => [
    ...new Set(stacks.filter((s) => s.kind === kind).map((s) => s.gameId)),
  ]
  const rows = stacks.length
    ? await db.item.findMany({
        where: {
          OR: [
            { kind: 'item', gameId: { in: gameIds('item') } },
            { kind: 'cargo', gameId: { in: gameIds('cargo') } },
          ],
        },
        select: { id: true, kind: true, gameId: true },
      })
    : []
  return new Map<ItemKey, number>(rows.map((row) => [itemKey(row.kind, row.gameId), row.id]))
}

async function upsertContainer(
  tx: Tx,
  snap: ContainerSnapshot,
  gamePlayerId: number | null,
  claimName: string | null,
  now: Date
) {
  const data = {
    gamePlayerId,
    name: snap.name,
    claimEntityId: snap.claim?.entityId ?? null,
    claimName: claimName ?? snap.claim?.name ?? null,
    lastSeenAt: now,
  }
  const container = await tx.inventoryContainer.upsert({
    where: { kind_gameEntityId: { kind: snap.kind, gameEntityId: snap.gameEntityId } },
    create: { kind: snap.kind, gameEntityId: snap.gameEntityId, ...data },
    update: data,
    select: { id: true },
  })
  return container.id
}

/** Replaces the synced entries of a container; pockets with the same item are summed */
async function replaceEntries(
  tx: Tx,
  containerId: number,
  stacks: StackRef[],
  itemIds: Map<ItemKey, number>,
  unknown: Set<ItemKey>,
  now: Date
) {
  await tx.inventoryEntry.deleteMany({ where: { containerId, source: 'sync' } })

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

  await tx.inventoryEntry.createMany({
    data: [...totals].map(([itemId, quantity]) => ({
      containerId,
      itemId,
      quantity,
      source: 'sync' as const,
      syncedAt: now,
    })),
  })
  return totals.size
}

/** Claim chests of any claim not in the list (all of them for an empty list) */
function dropOtherClaims(client: Tx, claimIds: string[]) {
  return client.inventoryContainer.deleteMany({
    where: {
      kind: 'claim',
      ...(claimIds.length && {
        OR: [{ claimEntityId: null }, { claimEntityId: { notIn: claimIds } }],
      }),
    },
  })
}

/** "Personagens: 2 de 2 · Locais: 14 · Itens diferentes por local: 30" (the script) */
export function syncSummary(run: Pick<SyncRun, 'counts'>) {
  const counts = (run.counts ?? {}) as Partial<SyncCounts>
  const claims = counts.claimsTotal
    ? `Claims: ${counts.claims ?? 0} de ${counts.claimsTotal} · `
    : ''
  return (
    `Personagens: ${counts.players ?? 0} de ${counts.playersTotal ?? 0} · ${claims}` +
    `Locais: ${counts.containers ?? 0} · Itens diferentes por local: ${counts.entries ?? 0}`
  )
}
