'use client'

import { Box, Text } from '@chakra-ui/react'
import type { ReactNode } from 'react'

/** A list with nothing to show, and why */
export function EmptyNotice({ children }: { children: ReactNode }) {
  return (
    <Box borderWidth="1px" borderStyle="dashed" rounded="l2" p="8" textAlign="center" bg="bg">
      <Text color="fg.muted">{children}</Text>
    </Box>
  )
}
