import type { ReactNode } from 'react'
import { AppShell } from '@/components/layout/app_shell'
import { formatDate } from '@/lib/format'
import { latestFinishedImport } from '@/models/game_data_import'

/** Every page reads the database: nothing here is built ahead of time */
export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const gameData = await latestFinishedImport()
  const gameDataDate = gameData ? formatDate(gameData.sourceDate ?? gameData.finishedAt) : null
  return <AppShell gameDataDate={gameDataDate}>{children}</AppShell>
}
