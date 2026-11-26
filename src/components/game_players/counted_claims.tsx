'use client'

import { Checkbox, Heading, Stack, Text } from '@chakra-ui/react'
import { useOptimistic, useTransition } from 'react'
import { updateClaimBuildingChoice, updateCountedClaim } from '@/app/(app)/game_player/actions'

export interface ClaimChoice {
  entityId: string
  name: string
  counted: boolean
  /** The character can open the claim's chests: without it, the claim can't be switched on */
  inventory: boolean
}

export interface BuildingKindChoice {
  buildingId: number
  name: string
  buildings: number
  counted: boolean
}

function ChoiceCheckbox({
  checked,
  disabled = false,
  label,
  save,
}: {
  checked: boolean
  disabled?: boolean
  label: string
  save: (checked: boolean) => Promise<void>
}) {
  const [, startTransition] = useTransition()
  const [shown, setShown] = useOptimistic(checked)
  return (
    <Checkbox.Root
      size="sm"
      checked={shown}
      disabled={disabled}
      onCheckedChange={({ checked }) =>
        startTransition(async () => {
          setShown(checked === true)
          await save(checked === true)
        })
      }
    >
      <Checkbox.HiddenInput />
      <Checkbox.Control />
      <Checkbox.Label>{label}</Checkbox.Label>
    </Checkbox.Root>
  )
}

/**
 * The character's claims, each with whether its chests count toward the
 * account's inventory (off until the account switches one on; never without
 * inventory permission), and which kinds of building of them count.
 */
export function CountedClaims({
  claims,
  kinds,
}: {
  claims: ClaimChoice[]
  kinds: BuildingKindChoice[]
}) {
  return (
    <Stack gap="2" mt="6">
      <Heading as="h2" size="md">
        Baús das claims
      </Heading>
      <Text textStyle="sm" color="fg.muted">
        Marque as claims cujos baús entram no seu inventário, na calculadora e nos planos
        compartilhados com você. Só dá para marcar as claims em que seu personagem tem permissão de
        inventário. Os itens aparecem na próxima sincronização.
      </Text>
      {claims.map((claim) => (
        <ChoiceCheckbox
          key={claim.entityId}
          checked={claim.counted}
          disabled={!claim.inventory}
          label={claim.inventory ? claim.name : `${claim.name} (sem permissão de inventário)`}
          save={(counted) => updateCountedClaim(claim.entityId, counted)}
        />
      ))}
      {kinds.length > 0 && (
        <>
          <Heading as="h3" size="sm" mt="4">
            Construções que contam
          </Heading>
          <Text textStyle="sm" color="fg.muted">
            Vale para todas as suas claims marcadas. Baús, cargo bins e stockpiles começam marcados;
            bancas de venda (Barter Stall), não. A Hexite Reserve é do império e nunca entra.
          </Text>
          {kinds.map((kind) => (
            <ChoiceCheckbox
              key={kind.buildingId}
              checked={kind.counted}
              label={`${kind.name} ×${kind.buildings}`}
              save={(counted) => updateClaimBuildingChoice(kind.buildingId, counted)}
            />
          ))}
        </>
      )}
    </Stack>
  )
}
