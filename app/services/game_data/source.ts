import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DateTime } from 'luxon'

/**
 * The game tables the importer reads, as published by the community
 * repository BitCraftToolBox/BitCraft_GameData (branch cereal/cs, static/).
 */
export const GAME_TABLES = [
  'item_desc',
  'cargo_desc',
  'item_list_desc',
  'crafting_recipe_desc',
  'construction_recipe_desc',
  'building_desc',
  'building_type_desc',
  'skill_desc',
  'tool_type_desc',
] as const

export type GameTable = (typeof GAME_TABLES)[number]

export interface SourceInfo {
  source: 'github' | 'local' | 'memory'
  commitSha: string | null
  date: DateTime | null
}

export interface GameDataSource {
  describe(): Promise<SourceInfo>
  read(table: GameTable): Promise<any[]>
}

const REPOSITORY = 'BitCraftToolBox/BitCraft_GameData'
const BRANCH = 'cereal/cs'

/**
 * Downloads the tables from GitHub at one commit (the latest on the branch
 * when none is given), so every table comes from the same snapshot.
 */
export class GitHubSource implements GameDataSource {
  #commit?: string
  #resolved?: SourceInfo

  constructor(commit?: string) {
    this.#commit = commit
  }

  async describe(): Promise<SourceInfo> {
    if (this.#resolved) return this.#resolved

    const ref = encodeURIComponent(this.#commit ?? BRANCH)
    const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/commits/${ref}`, {
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'bitcraft-companion' },
    })
    if (!response.ok) {
      throw new Error(
        `GitHub respondeu ${response.status} ao buscar o commit ${decodeURIComponent(ref)}`
      )
    }
    const body = (await response.json()) as { sha: string; commit: { committer: { date: string } } }

    this.#resolved = {
      source: 'github',
      commitSha: body.sha,
      date: DateTime.fromISO(body.commit.committer.date),
    }
    return this.#resolved
  }

  async read(table: GameTable): Promise<any[]> {
    const { commitSha } = await this.describe()
    const url = `https://raw.githubusercontent.com/${REPOSITORY}/${commitSha}/static/${table}.json`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`GitHub respondeu ${response.status} ao baixar ${table}.json`)
    return (await response.json()) as any[]
  }
}

/**
 * Reads the same JSON files from a local folder (a clone of the repository's
 * static/ folder).
 */
export class LocalSource implements GameDataSource {
  constructor(private dir: string) {}

  async describe(): Promise<SourceInfo> {
    return { source: 'local', commitSha: null, date: null }
  }

  async read(table: GameTable): Promise<any[]> {
    return JSON.parse(await readFile(join(this.dir, `${table}.json`), 'utf8'))
  }
}

/**
 * Tables held in memory. Used by the tests to tweak a fixture between runs.
 */
export class MemorySource implements GameDataSource {
  constructor(public tables: Record<GameTable, any[]>) {}

  async describe(): Promise<SourceInfo> {
    return { source: 'memory', commitSha: null, date: null }
  }

  async read(table: GameTable): Promise<any[]> {
    return this.tables[table]
  }
}
