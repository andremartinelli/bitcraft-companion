'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useRef, useTransition } from 'react'

/**
 * Filters that live in the URL: a change replaces the query string and the
 * server renders the page again (what htmx's hx-get + hx-push-url did).
 * Any change goes back to the first page. `pending` is true while the new
 * page loads.
 */
export function useUrlFilters(debounceMs = 300) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const update = useCallback(
    (changes: Record<string, string | null | undefined>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(changes)) {
        if (value) params.set(key, value)
        else params.delete(key)
      }
      params.delete('page')
      const query = params.toString()
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
      })
    },
    [pathname, router, searchParams]
  )

  /** For text typed in a search box: waits for a pause in the typing */
  const updateLater = useCallback(
    (changes: Record<string, string | null | undefined>) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => update(changes), debounceMs)
    },
    [debounceMs, update]
  )

  return { update, updateLater, pending }
}
