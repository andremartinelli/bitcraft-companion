'use client'

import { Button, HStack, Spinner, Text } from '@chakra-ui/react'
import { useRouter } from 'next/navigation'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { SyncResponse } from '@/app/api/inventory/sync/route'

interface SyncControlsProps {
  /** The inventory is old: read it again as soon as the page opens */
  stale: boolean
  /** In a plan: its characters, not only the account's */
  planId?: number
  /** On the Tasks page: the characters ticked in its "Inventários" too */
  tasks?: boolean
}

const FAILED: SyncResponse = {
  refresh: false,
  notice: 'Não foi possível sincronizar agora. Tente de novo.',
  ok: false,
}

/**
 * POST /api/inventory/sync. A fetch, not a server action or a transition:
 * the page stays usable while BitJita answers (saves, recipe changes and
 * links don't wait for it). Shows the new data when it is done.
 */
async function requestSync(
  onlyIfStale: boolean,
  planId?: number,
  tasks?: boolean
): Promise<SyncResponse> {
  try {
    const response = await fetch('/api/inventory/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ onlyIfStale, planId, tasks }),
    })
    return response.ok ? ((await response.json()) as SyncResponse) : FAILED
  } catch {
    return FAILED
  }
}

/**
 * "Sincronizar agora", and the sync on demand: a page that shows the
 * inventory opens at once with what is saved and, when that is old, reads
 * BitJita in the background and then shows the new data. No timer.
 */
export function SyncControls({ stale, planId, tasks }: SyncControlsProps) {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null)
  const asked = useRef(false)

  const sync = async (onlyIfStale: boolean) => {
    setSyncing(true)
    const result = await requestSync(onlyIfStale, planId, tasks)
    setSyncing(false)
    if (result.refresh) router.refresh()
    return result
  }

  const syncOld = useEffectEvent(() => void sync(true))
  useEffect(() => {
    // Once per page: the server checks again, so two tabs don't both sync
    if (!stale || asked.current) return
    asked.current = true
    syncOld()
  }, [stale])

  const syncNowClicked = async () => {
    setNotice(null)
    const result = await sync(false)
    if (result.notice) setNotice({ text: result.notice, ok: result.ok })
  }

  return (
    <HStack gap="2" wrap="wrap">
      <Button size="xs" variant="outline" onClick={syncNowClicked} disabled={syncing}>
        Sincronizar agora
      </Button>
      {syncing ? (
        <HStack gap="1.5" color="fg.muted" role="status">
          <Spinner size="xs" />
          <Text textStyle="sm">Sincronizando com a BitJita…</Text>
        </HStack>
      ) : (
        notice && (
          <Text textStyle="sm" color={notice.ok ? 'fg.success' : 'fg.error'} role="status">
            {notice.text}
          </Text>
        )
      )}
    </HStack>
  )
}
