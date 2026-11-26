'use client'

import { Button, Menu, Portal, Text } from '@chakra-ui/react'
import { useOptimistic, useTransition } from 'react'
import { LuChevronDown, LuWarehouse } from 'react-icons/lu'
import { updatePlanSetting } from '@/app/(app)/plans/actions'
import type { PlanClaim } from '@/services/inventory/scope'

/**
 * "Claims": the claims the plan's people count ("Meu personagem"), each one
 * used or left out by this account. Like "Usar apenas meu inventário", each
 * account chooses for itself; the page is calculated again with it.
 */
export function PlanClaims({ planId, claims }: { planId: number; claims: PlanClaim[] }) {
  const [, startTransition] = useTransition()
  const [shown, change] = useOptimistic(
    claims,
    (current, { entityId, used }: { entityId: string; used: boolean }) =>
      current.map((claim) => (claim.entityId === entityId ? { ...claim, used } : claim))
  )
  const usedCount = shown.filter((claim) => claim.used).length

  return (
    <Menu.Root closeOnSelect={false} positioning={{ placement: 'bottom-start' }}>
      <Menu.Trigger asChild>
        <Button size="xs" variant="outline">
          <LuWarehouse aria-hidden />
          Claims ({usedCount} de {shown.length})
          <LuChevronDown aria-hidden />
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="56" maxH="96" overflowY="auto">
            <Menu.ItemGroup>
              <Menu.ItemGroupLabel>Baús das claims neste plano</Menu.ItemGroupLabel>
              {shown.map((claim) => (
                <Menu.CheckboxItem
                  key={claim.entityId}
                  value={claim.entityId}
                  checked={claim.used}
                  onCheckedChange={(used) =>
                    startTransition(async () => {
                      change({ entityId: claim.entityId, used })
                      await updatePlanSetting(planId, { claimEntityId: claim.entityId, used })
                    })
                  }
                >
                  <Text flex="1">{claim.name}</Text>
                  <Menu.ItemIndicator />
                </Menu.CheckboxItem>
              ))}
            </Menu.ItemGroup>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  )
}
