import { cache } from 'react'
import { db } from '@/lib/db'

/**
 * The latest finished import of the game data: the layout says which data
 * the app shows, and the calculator keys its recipe graph on it. Once per
 * request (React cache).
 */
export const latestFinishedImport = cache(() =>
  db.gameDataImport.findFirst({
    where: { finishedAt: { not: null } },
    orderBy: { id: 'desc' },
    select: { id: true, commitSha: true, sourceDate: true, finishedAt: true },
  })
)
