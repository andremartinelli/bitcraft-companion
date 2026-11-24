import type { ReactNode } from 'react'
import { AppShell } from '@/components/layout/app_shell'
import { formatDate } from '@/lib/format'
import { requireUser } from '@/lib/session'
import { latestFinishedImport } from '@/models/game_data_import'

/** Every page reads the database: nothing here is built ahead of time */
export const dynamic = 'force-dynamic'

/** Every page of the app needs a session (the proxy checks it first) */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const [user, gameData] = await Promise.all([requireUser(), latestFinishedImport()])
  const gameDataDate = gameData ? formatDate(gameData.sourceDate ?? gameData.finishedAt) : null
  return (
    <AppShell gameDataDate={gameDataDate} userName={user.fullName || user.email}>
      {children}
    </AppShell>
  )
}
