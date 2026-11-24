'use client'

import { Button, HStack, Spinner, Text } from '@chakra-ui/react'
import { useEffect, useRef, useState, useTransition } from 'react'
import { syncIfStale, syncNow } from '@/app/(app)/inventory/actions'

interface SyncControlsProps {
  /** The inventory is old: read it again as soon as the page opens */
  stale: boolean
}

/**
 * "Sincronizar agora", and the sync on demand: a page that shows the
 * inventory opens at once with what is saved and, when that is old, reads
 * BitJita in the background and then shows the new data. No timer.
 */
export function SyncControls({ stale }: SyncControlsProps) {
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null)
  const asked = useRef(false)

  useEffect(() => {
    // Once per page: the server checks again, so two tabs don't both sync
    if (!stale || asked.current) return
    asked.current = true
    startTransition(async () => {
      await syncIfStale()
    })
  }, [stale])

  const syncNowClicked = () =>
    startTransition(async () => {
      setNotice(null)
      const result = await syncNow()
      setNotice({ text: result.notice, ok: result.ok })
    })

  return (
    <HStack gap="2" wrap="wrap">
      <Button size="xs" variant="outline" onClick={syncNowClicked} disabled={pending}>
        Sincronizar agora
      </Button>
      {pending ? (
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
