'use client'

import { chakra, type HTMLChakraProps } from '@chakra-ui/react'
import { useCallback } from 'react'

const storageKey = (key: string) => `open:${key}`

interface RememberedDetailsProps extends HTMLChakraProps<'details'> {
  /** Where this browser remembers it open or closed */
  rememberKey: string
  defaultOpen?: boolean
  /** All done: "Colapsar todos os concluídos" closes it */
  complete?: boolean
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
  children,
  ...props
}: RememberedDetailsProps) {
  const restore = useCallback(
    (element: HTMLDetailsElement | null) => {
      if (!element) return
      try {
        const saved = localStorage.getItem(storageKey(rememberKey))
        if (saved !== null) element.open = saved === '1'
      } catch {
        // Storage blocked: the default stays
      }
    },
    [rememberKey]
  )

  return (
    <chakra.details
      ref={restore}
      open={defaultOpen}
      data-complete={complete ? '' : undefined}
      // The arrow of its summary turns when it is open
      css={{ '&[open] > summary::before': { transform: 'rotate(90deg)' } }}
      onToggle={(event) => {
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
