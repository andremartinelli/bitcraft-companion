'use client'

import { ChakraProvider } from '@chakra-ui/react'
import type { ReactNode } from 'react'
import { EmotionRegistry } from '@/components/ui/emotion_registry'
import { system } from '@/components/ui/theme'

/** Chakra, with its styles sent in the head (see EmotionRegistry) */
export function Provider({ children }: { children: ReactNode }) {
  return (
    <EmotionRegistry>
      <ChakraProvider value={system}>{children}</ChakraProvider>
    </EmotionRegistry>
  )
}
