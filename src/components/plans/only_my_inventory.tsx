'use client'

import { Checkbox } from '@chakra-ui/react'
import { useOptimistic, useTransition } from 'react'
import { updatePlanSetting } from '@/app/(app)/plans/actions'

/**
 * "Usar apenas meu inventário": only the account's character, without the
 * plan's other people. Each account chooses for itself; the page is
 * calculated again with it.
 */
export function OnlyMyInventory({ planId, checked }: { planId: number; checked: boolean }) {
  const [, startTransition] = useTransition()
  const [shown, setShown] = useOptimistic(checked)
  return (
    <Checkbox.Root
      size="sm"
      checked={shown}
      onCheckedChange={({ checked: next }) =>
        startTransition(async () => {
          setShown(next === true)
          await updatePlanSetting(planId, { onlyMyInventory: next === true })
        })
      }
    >
      <Checkbox.HiddenInput />
      <Checkbox.Control />
      <Checkbox.Label>Usar apenas meu inventário</Checkbox.Label>
    </Checkbox.Root>
  )
}
