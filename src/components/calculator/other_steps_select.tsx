'use client'

import { HStack, NativeSelect, Text } from '@chakra-ui/react'
import { useOptimistic, useTransition } from 'react'
import type { OtherStepsMode } from '@/services/calculator/steps_view'

export const OTHER_STEPS_LABELS: Record<OtherStepsMode, string> = {
  show: 'Mostrar',
  collapse: 'Colapsar',
  hide: 'Esconder',
}

/** "Etapas de outras profissões: Mostrar | Colapsar | Esconder", saved on change */
export function OtherStepsSelect({
  value,
  save,
  label = 'Etapas de outras profissões',
}: {
  value: OtherStepsMode
  save: (mode: OtherStepsMode) => Promise<void>
  label?: string
}) {
  const [, startTransition] = useTransition()
  const [shown, setShown] = useOptimistic(value)
  return (
    <HStack as="label" gap="2" textStyle="sm">
      <Text as="span" color="fg.muted">
        {label}
      </Text>
      <NativeSelect.Root size="xs" width="auto">
        <NativeSelect.Field
          value={shown}
          bg="bg"
          onChange={(event) => {
            const mode = event.currentTarget.value as OtherStepsMode
            startTransition(async () => {
              setShown(mode)
              await save(mode)
            })
          }}
        >
          {Object.entries(OTHER_STEPS_LABELS).map(([mode, text]) => (
            <option key={mode} value={mode}>
              {text}
            </option>
          ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    </HStack>
  )
}
