import type { Metadata } from 'next'
import { AddGamePlayerForm } from '@/components/game_players/add_game_player_form'
import { GamePlayerTable } from '@/components/game_players/game_player_table'
import { EmptyNotice } from '@/components/layout/empty_notice'
import { LinkButton } from '@/components/layout/link_button'
import { PageHeader } from '@/components/layout/page_header'
import { formatAgo } from '@/lib/format'
import { requireUser } from '@/lib/session'
import { claimNames, listGamePlayers, MAX_PLAYERS_PER_USER } from '@/models/game_player'

export const metadata: Metadata = { title: 'Personagens' }

/** Adding a character asks BitJita */
export const maxDuration = 60

/**
 * GET /game_players: the characters whose inventories this account follows,
 * by nick, read from BitJita's public API. No password or game token.
 */
export default async function GamePlayersPage() {
  const user = await requireUser()
  const players = await listGamePlayers(user.id)

  return (
    <>
      <PageHeader
        title="Personagens"
        description={`Os personagens cujo inventário você quer ver, lidos na API pública da BitJita (até ${MAX_PLAYERS_PER_USER}). Só dados públicos: nada de senha nem token do jogo.`}
        actions={<LinkButton href="/inventory">Inventário</LinkButton>}
      />
      <AddGamePlayerForm />
      {players.length ? (
        <GamePlayerTable
          players={players.map((player) => ({
            id: player.id,
            username: player.username,
            region: player.regionId ? `Região ${player.regionId}` : '—',
            claims: claimNames(player.claims) || '—',
            lastRead: player.lastSyncedAt ? formatAgo(player.lastSyncedAt) : 'ainda não',
            lastError: player.lastError,
          }))}
        />
      ) : (
        <EmptyNotice>
          Nenhum personagem ainda. Adicione pelo nick os personagens cujo inventário você quer ver.
        </EmptyNotice>
      )}
    </>
  )
}
