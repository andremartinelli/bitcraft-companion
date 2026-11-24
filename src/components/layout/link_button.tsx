'use client'

import { Button, type ButtonProps } from '@chakra-ui/react'
import NextLink from 'next/link'
import type { ReactNode } from 'react'

/** A link that looks like a button ("Personagens", "Inventário") */
export function LinkButton({
  href,
  variant = 'outline',
  children,
}: {
  href: string
  variant?: ButtonProps['variant']
  children: ReactNode
}) {
  return (
    <Button asChild size="sm" variant={variant}>
      <NextLink href={href}>{children}</NextLink>
    </Button>
  )
}
