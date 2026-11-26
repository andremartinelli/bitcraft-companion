'use client'

import { Button, Menu, Portal, Text } from '@chakra-ui/react'
import { useOptimistic, useTransition } from 'react'
import { LuChevronDown, LuPackage } from 'react-icons/lu'
import type { ScopeClaim, ScopePerson } from '@/services/inventory/scope'

type Choice = { gamePlayerId: number; used: boolean } | { claimEntityId: string; used: boolean }

/**
 * "Inventários": the characters and claim chests the page can count, each one
 * ticked or left out by this account (in a plan and on the Tasks page). The
 * page is calculated again with the choice; nobody else sees it change.
 */
export function InventoryMenu({
  people,
  claims,
  save,
}: {
  people: ScopePerson[]
  claims: ScopeClaim[]
  save: (choice: Choice) => Promise<void>
}) {
  const [, startTransition] = useTransition()
  const [shown, change] = useOptimistic({ people, claims }, (current, choice: Choice) =>
    'gamePlayerId' in choice
      ? {
          ...current,
          people: current.people.map((person) =>
            person.gamePlayerId === choice.gamePlayerId ? { ...person, used: choice.used } : person
          ),
        }
      : {
          ...current,
          claims: current.claims.map((claim) =>
            claim.entityId === choice.claimEntityId ? { ...claim, used: choice.used } : claim
          ),
        }
  )
  const all = [...shown.people, ...shown.claims]
  const choose = (choice: Choice) =>
    startTransition(async () => {
      change(choice)
      await save(choice)
    })

  return (
    <Menu.Root closeOnSelect={false} positioning={{ placement: 'bottom-start' }}>
      <Menu.Trigger asChild>
        <Button size="xs" variant="outline">
          <LuPackage aria-hidden />
          Inventários ({all.filter((entry) => entry.used).length} de {all.length})
          <LuChevronDown aria-hidden />
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="56" maxH="96" overflowY="auto">
            {shown.people.length > 0 && (
              <Menu.ItemGroup>
                <Menu.ItemGroupLabel>Personagens</Menu.ItemGroupLabel>
                {shown.people.map((person) => (
                  <Menu.CheckboxItem
                    key={person.gamePlayerId}
                    value={String(person.gamePlayerId)}
                    checked={person.used}
                    onCheckedChange={(used) => choose({ gamePlayerId: person.gamePlayerId, used })}
                  >
                    <Text flex="1">
                      {person.mine ? `${person.name} (meu personagem)` : person.name}
                    </Text>
                    <Menu.ItemIndicator />
                  </Menu.CheckboxItem>
                ))}
              </Menu.ItemGroup>
            )}
            {shown.claims.length > 0 && (
              <Menu.ItemGroup>
                <Menu.ItemGroupLabel>Baús das claims</Menu.ItemGroupLabel>
                {shown.claims.map((claim) => (
                  <Menu.CheckboxItem
                    key={claim.entityId}
                    value={claim.entityId}
                    checked={claim.used}
                    onCheckedChange={(used) => choose({ claimEntityId: claim.entityId, used })}
                  >
                    <Text flex="1">{claim.name}</Text>
                    <Menu.ItemIndicator />
                  </Menu.CheckboxItem>
                ))}
              </Menu.ItemGroup>
            )}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  )
}
