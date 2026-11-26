import type { Metadata } from 'next'
import { AddGamePlayerForm } from '@/components/game_players/add_game_player_form'
import { CountedClaims } from '@/components/game_players/counted_claims'
import { GamePlayerTable, type GamePlayerRow } from '@/components/game_players/game_player_table'
import { EmptyNotice } from '@/components/layout/empty_notice'
import { LinkButton } from '@/components/layout/link_button'
import { PageHeader } from '@/components/layout/page_header'
import { formatAgo } from '@/lib/format'
import { requireUser } from '@/lib/session'
import { accountClaims } from '@/models/counted_claim'
import { claimNames, findAccountPlayer } from '@/models/game_player'

export const metadata: Metadata = { title: 'Meu personagem' }

/** Choosing the character asks BitJita */
export const maxDuration = 60

const toRow = (player: NonNullable<Awaited<ReturnType<typeof findAccountPlayer>>>) =>
  ({
    id: player.id,
    username: player.username,
    region: player.regionId ? `Região ${player.regionId}` : '—',
    claims: claimNames(player.claims) || '—',
    lastRead: player.lastSyncedAt ? formatAgo(player.lastSyncedAt) : 'ainda não',
    lastError: player.lastError,
  }) satisfies GamePlayerRow

/**
 * GET /game_player: the account's character, by nick, read from BitJita's
 * public API. No password or game token.
 */
export default async function GamePlayerPage() {
  const user = await requireUser()
  const [mine, claims] = await Promise.all([findAccountPlayer(user.id), accountClaims(user.id)])

  return (
    <>
      <PageHeader
        title="Meu personagem"
        description="O seu personagem no jogo, lido na API pública da BitJita. O inventário dele entra na calculadora, no Inventário e nos planos compartilhados com você. Só dados públicos: nada de senha nem token do jogo."
        actions={<LinkButton href="/inventory">Inventário</LinkButton>}
      />
      {mine ? (
        <>
          <GamePlayerTable players={[toRow(mine)]} />
          {claims.length > 0 && <CountedClaims claims={claims} />}
        </>
      ) : (
        <>
          <AddGamePlayerForm />
          <EmptyNotice>
            Nenhum personagem ainda. Informe o nick do seu personagem para ler o inventário dele.
          </EmptyNotice>
        </>
      )}
    </>
  )
}
