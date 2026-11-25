'use client'

import { chakra, type HTMLChakraProps } from '@chakra-ui/react'
import { useCallback } from 'react'

const storageKey = (key: string) => `open:${key}`

interface RememberedDetailsProps extends HTMLChakraProps<'details'> {
  /** Where this browser remembers it open or closed */
  rememberKey: string
  defaultOpen?: boolean
  /** All done: "Esconder concluídos" hides it (data-complete) */
  complete?: boolean
  /** False: always starts as `defaultOpen` and forgets toggles (the inventory during a search) */
  remember?: boolean
}

/**
 * A <details> that stays open or closed as the user left it, also when the
 * calculator redraws it. Until the user toggles it, `defaultOpen` decides.
 * The DOM keeps the state: React never sets `open` again after mounting.
 */
export function RememberedDetails({
  rememberKey,
  defaultOpen = true,
  complete = false,
  remember = true,
  children,
  ...props
}: RememberedDetailsProps) {
  const restore = useCallback(
    (element: HTMLDetailsElement | null) => {
      if (!element || !remember) return
      try {
        const saved = localStorage.getItem(storageKey(rememberKey))
        if (saved !== null) element.open = saved === '1'
      } catch {
        // Storage blocked: the default stays
      }
    },
    [rememberKey, remember]
  )

  return (
    <chakra.details
      ref={restore}
      open={defaultOpen}
      data-complete={complete ? '' : undefined}
      // The arrow of its summary turns when it is open
      css={{ '&[open] > summary::before': { transform: 'rotate(90deg)' } }}
      onToggle={(event) => {
        if (!remember) return
        try {
          localStorage.setItem(storageKey(rememberKey), event.currentTarget.open ? '1' : '0')
        } catch {
          // Storage blocked: nothing to remember with
        }
      }}
      {...props}
    >
      {children}
    </chakra.details>
  )
}

/** The title line of a RememberedDetails, with an arrow that turns when it is open */
export const DetailsSummary = chakra('summary', {
  base: {
    'cursor': 'pointer',
    'display': 'flex',
    'alignItems': 'baseline',
    'gap': '3',
    'py': '2',
    'listStyle': 'none',
    '_marker': { display: 'none' },
    '&::-webkit-details-marker': { display: 'none' },
    '_before': { content: '"▸"', color: 'fg.muted', transition: 'transform 0.15s' },
  },
})
