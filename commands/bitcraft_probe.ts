import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { mkdir, writeFile } from 'node:fs/promises'

/**
 * Feasibility check for the inventory sync: can we read the live game with
 * the stored token, and what do the tables look like in 1.0? Prints a summary
 * only (no token, no raw inventories). --record saves raw responses to
 * tmp/game_api_probe/ (git-ignored) to build test fixtures from.
 */
export default class BitcraftProbe extends BaseCommand {
  static commandName = 'bitcraft:probe'
  static description = 'Testa a leitura dos dados ao vivo do BitCraft com o token guardado'

  static options: CommandOptions = { startApp: true }

  @flags.string({
    description: 'E-mail da conta do app cujo token será usado (padrão: o primeiro conectado)',
  })
  declare user?: string

  @flags.array({ description: 'Nick(s) no jogo para procurar (repita a flag para mais de um)' })
  declare username?: string[]

  @flags.boolean({ description: 'Grava as respostas brutas em tmp/game_api_probe/' })
  declare record?: boolean

  async run() {
    const { default: User } = await import('#models/user')
    const { default: GameCredential } = await import('#models/game_credential')
    const { default: Item } = await import('#models/item')
    const api = await import('#services/game_sync/game_api_client')

    const owner = this.user ? await User.findBy('email', this.user) : null
    const credential = owner
      ? await GameCredential.findBy('user_id', owner.id)
      : await GameCredential.query().orderBy('id').first()
    const token = credential?.token ?? null
    if (!token) {
      this.logger.error('Nenhum token guardado. Rode antes: node ace bitcraft:login')
      this.exitCode = 1
      return
    }

    const recordDir = this.app.tmpPath('game_api_probe')
    if (this.record) await mkdir(recordDir, { recursive: true })
    const quote = (value: string) => `'${value.replace(/'/g, "''")}'`

    /** Runs one query, prints a one-line outcome, never throws */
    const run = async (label: string, query: string, target: { host?: string; module: string }) => {
      try {
        if (this.record) {
          const raw = await api.sqlRaw(query, { ...target, token })
          await writeFile(`${recordDir}/${label.replace(/\W+/g, '_')}.json`, raw.body)
        }
        const [rows] = await api.sql(query, { ...target, token })
        this.logger.log(`  ✓ ${label}: ${rows.length} linha(s)`)
        return rows
      } catch (error) {
        const e = error as InstanceType<typeof api.GameApiError>
        this.logger.log(
          `  ✗ ${label}: ${e.message}${e.detail ? ` — ${e.detail.slice(0, 160)}` : ''}`
        )
        return null
      }
    }

    this.logger.info(`Global (${api.GLOBAL_HOST}/${api.GLOBAL_MODULE})`)
    const regions = (await run('region_connection_info', 'SELECT * FROM region_connection_info', {
      module: api.GLOBAL_MODULE,
    })) as { id: number; host: string; module: string }[] | null
    if (regions?.length) {
      this.logger.log(
        `    regiões: ${regions.map((r) => `${r.id}=${r.module}@${r.host}`).join(', ')}`
      )
    }

    let myRegion: number | null = null
    if (credential?.identity) {
      const hex = credential.identity.replace(/^0x/, '')
      const rows = (await run(
        'user_region_state (minha identity)',
        `SELECT * FROM user_region_state WHERE identity = 0x${hex}`,
        { module: api.GLOBAL_MODULE }
      )) as { region_id: number }[] | null
      myRegion = rows?.[0]?.region_id ?? null
      this.logger.log(`    minha região: ${myRegion ?? 'não encontrada'}`)
    } else {
      this.logger.log('  – sem identity no token: a região será procurada pelo nick')
    }

    for (const username of this.username ?? []) {
      this.logger.info(`Jogador "${username}"`)
      const candidates = (regions ?? []).filter((r) => myRegion === null || r.id === myRegion)
      let found: { region: { id: number; host: string; module: string }; entityId: string } | null =
        null
      for (const region of candidates.length ? candidates : (regions ?? [])) {
        const rows = (await run(
          `player_username_state @ ${region.module}`,
          `SELECT * FROM player_username_state WHERE username = ${quote(username)}`,
          region
        )) as { entity_id: number | string }[] | null
        if (rows?.length) {
          found = { region, entityId: String(rows[0].entity_id) }
          break
        }
      }
      if (!found) {
        this.logger.log('    não encontrado nas regiões que deu para ler')
        continue
      }
      const { region, entityId } = found
      this.logger.log(`    encontrado em ${region.module}, entity_id ${entityId}`)

      const owned = (await run(
        'inventory_state (owner)',
        `SELECT * FROM inventory_state WHERE owner_entity_id = ${entityId}`,
        region
      )) as Record<string, any>[] | null
      const banked = (await run(
        'inventory_state (player_owner)',
        `SELECT * FROM inventory_state WHERE player_owner_entity_id = ${entityId}`,
        region
      )) as Record<string, any>[] | null

      for (const inventory of [...(owned ?? []), ...(banked ?? [])]) {
        const stacks = (inventory.pockets ?? [])
          .map((p: any) => p?.contents)
          .filter((c: any) => c && typeof c === 'object')
        const sample = stacks.slice(0, 3)
        const names: string[] = []
        for (const stack of sample) {
          const kind = String(stack.item_type).toLowerCase().includes('cargo') ? 'cargo' : 'item'
          const item = await Item.findBy({ kind, gameId: stack.item_id })
          names.push(`${stack.quantity}× ${item?.name ?? `?(${kind} ${stack.item_id})`}`)
        }
        this.logger.log(
          `    inventário idx=${inventory.inventory_index} owner=${inventory.owner_entity_id === Number(entityId) || String(inventory.owner_entity_id) === entityId ? 'jogador' : inventory.owner_entity_id}: ` +
            `${stacks.length}/${inventory.pockets?.length ?? 0} pockets ocupados — ${names.join(', ') || '(vazio)'}`
        )
      }
      if (owned?.[0]) {
        this.logger.log(
          `    formato de um pocket: ${JSON.stringify(owned[0].pockets?.find((p: any) => p?.contents))?.slice(0, 200)}`
        )
      }

      for (const [label, query] of [
        [
          'claim_member_state',
          `SELECT * FROM claim_member_state WHERE player_entity_id = ${entityId}`,
        ],
        ['deployable_state', `SELECT * FROM deployable_state WHERE owner_id = ${entityId}`],
        ['deployable_state_v2', `SELECT * FROM deployable_state_v2 WHERE owner_id = ${entityId}`],
        [
          'player_housing_state',
          `SELECT * FROM player_housing_state WHERE entity_id = ${entityId}`,
        ],
      ]) {
        await run(label, query, region)
      }
    }

    if (this.record) this.logger.info(`Respostas brutas em ${recordDir}`)
  }
}
