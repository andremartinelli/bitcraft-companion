'use client'

import { Button, CloseButton, Dialog, Portal, Text } from '@chakra-ui/react'
import { useTransition } from 'react'
import { destroyPlan } from '@/app/(app)/plans/actions'

/** "Apagar plano", after a confirmation; then back to the list */
export function DestroyPlanButton({ planId, name }: { planId: number; name: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <Dialog.Root role="alertdialog" size="sm">
      <Dialog.Trigger asChild>
        <Button size="sm" variant="ghost">
          Apagar plano
        </Button>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Apagar o plano?</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Text>Apagar o plano &quot;{name}&quot;? Isso não pode ser desfeito.</Text>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button variant="outline" size="sm">
                  Cancelar
                </Button>
              </Dialog.ActionTrigger>
              <Button
                colorPalette="red"
                size="sm"
                loading={pending}
                onClick={() => startTransition(() => destroyPlan(planId))}
              >
                Apagar plano
              </Button>
            </Dialog.Footer>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
