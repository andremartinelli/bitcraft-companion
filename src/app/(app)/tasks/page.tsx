import type { Metadata } from 'next'
import { NoCharacterNotice } from '@/components/game_players/no_character_notice'
import { InventoryStatus } from '@/components/inventory/inventory_status'
import { LinkButton } from '@/components/layout/link_button'
import { PageHeader } from '@/components/layout/page_header'
import { TaskBoard } from '@/components/tasks/task_board'
import { formatAgo } from '@/lib/format'
import { requireUser } from '@/lib/session'
import { lastSuccessfulSyncRun, latestSyncRun, SYNC_STATUS_LABELS } from '@/models/sync_run'
import { inventoryFreshness } from '@/services/game_sync/stale_sync'
import { accountPlayerIds } from '@/models/game_player'
import { taskBoard } from '@/services/tasks/task_board'

export const metadata: Metadata = { title: 'Tasks' }

/**
 * GET /tasks: the travelers' tasks of the account's character (not quests),
 * read with the inventory from BitJita, and how many of each item it has. Like
 * the inventory page, an old read is read again in the background.
 */
export default async function TasksPage() {
  const user = await requireUser()
  const [latest, lastGood, freshness, board] = await Promise.all([
    latestSyncRun(user.id),
    lastSuccessfulSyncRun(user.id),
    accountPlayerIds(user.id).then(inventoryFreshness),
    taskBoard(user.id),
  ])

  return (
    <>
      <PageHeader
        title="Tasks"
        description="As tasks dos viajantes (não as quests): as que o seu personagem tem agora e as que podem aparecer no tier dele em cada viajante, com quanto você tem de cada item."
        actions={<LinkButton href="/inventory">Inventário</LinkButton>}
      />
      {board ? (
        <>
          <InventoryStatus
            latest={
              latest && {
                ago: formatAgo(latest.startedAt),
                status: SYNC_STATUS_LABELS[latest.status],
              }
            }
            lastGoodAgo={
              latest && lastGood && latest.id !== lastGood.id
                ? formatAgo(lastGood.startedAt)
                : null
            }
            notices={(latest?.message ?? '').split('\n').filter(Boolean)}
            stale={freshness.stale}
            hasPlayers={freshness.hasPlayers}
          />
          <TaskBoard travelers={board.travelers} read={board.syncedAt !== null} />
        </>
      ) : (
        <NoCharacterNotice />
      )}
    </>
  )
}
