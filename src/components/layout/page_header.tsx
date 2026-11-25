'use client'

import { Flex, Heading, Stack, Text } from '@chakra-ui/react'
import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  /** An image before the title (the item's icon) */
  icon?: ReactNode
  description?: ReactNode
  /** Buttons on the right of the title */
  actions?: ReactNode
}

/** The title of a page, with a line of description and its actions */
export function PageHeader({ title, icon, description, actions }: PageHeaderProps) {
  return (
    <Flex mb="6" gap="4" align="flex-start" justify="space-between" wrap="wrap">
      <Stack gap="1">
        <Flex gap="3" align="center">
          {icon}
          <Heading as="h1" size="2xl">
            {title}
          </Heading>
        </Flex>
        {description && <Text color="fg.muted">{description}</Text>}
      </Stack>
      {actions}
    </Flex>
  )
}
