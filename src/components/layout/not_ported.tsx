'use client'

import { EmptyState, VStack } from '@chakra-ui/react'
import { LuConstruction } from 'react-icons/lu'

/** An area that still lives only in the old app (see docs/design/2026-11-24-vercel.md) */
export function NotPorted({ area }: { area: string }) {
  return (
    <EmptyState.Root borderWidth="1px" rounded="l3" bg="bg">
      <EmptyState.Content>
        <EmptyState.Indicator>
          <LuConstruction />
        </EmptyState.Indicator>
        <VStack textAlign="center">
          <EmptyState.Title>{area}: ainda no app antigo</EmptyState.Title>
          <EmptyState.Description>
            Esta área ainda não foi portada para a versão da Vercel. Até lá, use o app que roda no
            PC.
          </EmptyState.Description>
        </VStack>
      </EmptyState.Content>
    </EmptyState.Root>
  )
}
