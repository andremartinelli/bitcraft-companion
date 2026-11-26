/**
 * npm run game-data:import -- [--commit=<sha>] [--path=<pasta>]
 *
 * Imports the static game data (BitCraftToolBox/BitCraft_GameData) into the
 * database of DATABASE_URL_UNPOOLED: on Neon, the direct URL. In production it
 * runs from the "Importar dados do jogo" workflow (.github/workflows/
 * game-data-import.yml), never on Vercel. Safe to re-run after every patch.
 */
import { existsSync } from 'node:fs'
import { parseArgs } from 'node:util'

if (existsSync('.env')) process.loadEnvFile('.env')
// Long transaction: the direct connection, not the pooler
if (process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED

const { db } = await import('@/lib/db')
const { default: GameDataImporter } = await import('@/services/game_data/importer')
const { GitHubSource, LocalSource } = await import('@/services/game_data/source')

const { values } = parseArgs({
  options: {
    commit: { type: 'string' },
    path: { type: 'string' },
  },
})

const source = values.path ? new LocalSource(values.path) : new GitHubSource(values.commit)
const started = Date.now()
const host = new URL(process.env.DATABASE_URL ?? 'postgres://?').host
console.log(`Banco: ${host}`)

try {
  const importer = new GameDataImporter((message) => console.log(`· ${message}`))
  const { counts, added, removed, renamed, skipped } = await importer.run(source)

  console.log(`\nImportação concluída em ${Math.round((Date.now() - started) / 1000)} s`)
  console.log(
    `Itens: ${counts.items} · Cargos: ${counts.cargo} · Saídas aleatórias: ${counts.itemLists} · ` +
      `Receitas de craft: ${counts.craftingRecipes} · Construção: ${counts.constructionRecipes} · ` +
      `Pesquisas do assentamento: ${counts.claimTechs} · Coletas: ${counts.extractionRecipes} · Caça: ${counts.hunting} · Tasks: ${counts.travelerTasks} · Quests que liberam tiers: ${counts.taskTierUnlocks}`
  )
  console.log(
    `Novos: ${added.items} itens, ${added.itemLists} listas, ${added.recipes} receitas · ` +
      `Removidos do jogo: ${removed.items} itens, ${removed.itemLists} listas, ${removed.recipes} receitas`
  )
  if (skipped.missingItems || skipped.unknownLookups) {
    console.warn(
      `Referências ignoradas nos dados do jogo: ${skipped.missingItems} a itens inexistentes, ` +
        `${skipped.unknownLookups} a skills/ferramentas/estações desconhecidas`
    )
  }
  for (const change of renamed) {
    console.warn(`Renomeado (${change.kind} ${change.gameId}): "${change.from}" → "${change.to}"`)
  }
} catch (error) {
  console.error('A importação falhou; nada foi gravado.')
  console.error(error)
  process.exitCode = 1
} finally {
  await db.$disconnect()
}
