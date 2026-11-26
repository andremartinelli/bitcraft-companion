'use client'

import { Checkbox, Heading, Stack, Text } from '@chakra-ui/react'
import { useOptimistic, useTransition } from 'react'
import { updateCountedClaim } from '@/app/(app)/game_player/actions'

export interface ClaimChoice {
  entityId: string
  name: string
  counted: boolean
}

function ClaimCheckbox({ claim }: { claim: ClaimChoice }) {
  const [, startTransition] = useTransition()
  const [shown, setShown] = useOptimistic(claim.counted)
  return (
    <Checkbox.Root
      size="sm"
      checked={shown}
      onCheckedChange={({ checked }) =>
        startTransition(async () => {
          setShown(checked === true)
          await updateCountedClaim(claim.entityId, checked === true)
        })
      }
    >
      <Checkbox.HiddenInput />
      <Checkbox.Control />
      <Checkbox.Label>{claim.name}</Checkbox.Label>
    </Checkbox.Root>
  )
}

/**
 * The character's claims, each with whether its chests count toward the
 * account's inventory. Off until the account switches one on.
 */
export function CountedClaims({ claims }: { claims: ClaimChoice[] }) {
  return (
    <Stack gap="2" mt="6">
      <Heading as="h2" size="md">
        Baús das claims
      </Heading>
      <Text textStyle="sm" color="fg.muted">
        Marque as claims cujos baús entram no seu inventário, na calculadora e nos planos
        compartilhados com você. Entram todos os baús da claim: a BitJita não diz quais você
        consegue abrir. Os itens aparecem na próxima sincronização.
      </Text>
      {claims.map((claim) => (
        <ClaimCheckbox key={claim.entityId} claim={claim} />
      ))}
    </Stack>
  )
}
