'use client'

import { Button, HStack } from '@chakra-ui/react'
import NextLink from 'next/link'

interface PagerProps {
  /** The URL of the previous page, with the current filters; none on the first */
  previousHref: string | null
  nextHref: string | null
}

/** "Anterior" and "Próxima", as links (they work without JavaScript too) */
export function Pager({ previousHref, nextHref }: PagerProps) {
  if (!previousHref && !nextHref) return null
  return (
    <HStack as="nav" aria-label="Páginas" gap="2" mt="4" justify="center">
      {previousHref && (
        <Button asChild size="sm" variant="outline">
          <NextLink href={previousHref}>Anterior</NextLink>
        </Button>
      )}
      {nextHref && (
        <Button asChild size="sm" variant="outline">
          <NextLink href={nextHref}>Próxima</NextLink>
        </Button>
      )}
    </HStack>
  )
}
