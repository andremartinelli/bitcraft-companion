import type { ReactNode } from 'react'
import { AppShell } from '@/components/layout/app_shell'
import { formatDate } from '@/lib/format'
import { requireUser } from '@/lib/session'
import { latestFinishedImport } from '@/models/game_data_import'
import { countInvites } from '@/models/group'

/** Every page reads the database: nothing here is built ahead of time */
export const dynamic = 'force-dynamic'

/** Every page of the app needs a session (the proxy checks it first) */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser()
  const [gameData, invites] = await Promise.all([latestFinishedImport(), countInvites(user.id)])
  const gameDataDate = gameData ? formatDate(gameData.sourceDate ?? gameData.finishedAt) : null
  return (
    <AppShell
      gameDataDate={gameDataDate}
      userName={user.fullName || user.email}
      inviteCount={invites}
      hasCharacter={user.gamePlayerId !== null}
    >
      {children}
    </AppShell>
  )
}
