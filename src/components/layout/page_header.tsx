'use client'

import { Flex, Heading, Stack, Text } from '@chakra-ui/react'
import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: ReactNode
  /** Buttons on the right of the title */
  actions?: ReactNode
}

/** The title of a page, with a line of description and its actions */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <Flex mb="6" gap="4" align="flex-start" justify="space-between" wrap="wrap">
      <Stack gap="1">
        <Heading as="h1" size="2xl">
          {title}
        </Heading>
        {description && <Text color="fg.muted">{description}</Text>}
      </Stack>
      {actions}
    </Flex>
  )
}
