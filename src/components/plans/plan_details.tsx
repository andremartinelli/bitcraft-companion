'use client'

import { Box, Field, Flex, Text } from '@chakra-ui/react'
import { useState, useTransition } from 'react'
import { updatePlan } from '@/app/(app)/plans/actions'
import { CommitInput } from '@/components/ui/commit_input'

interface PlanDetailsProps {
  planId: number
  name: string
  /** "Atualizado em 24/11/2026 por Vitor" */
  updated: string
  notes: string | null
}

/** The plan's name (saved when the field is left), when it changed and its notes */
export function PlanDetails({ planId, name, updated, notes }: PlanDetailsProps) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <Box mb="4">
      <Flex gap="3" align="center" wrap="wrap">
        <Field.Root orientation="horizontal" invalid={error !== null} width="auto" minW="0" gap="2">
          <Field.Label>Nome</Field.Label>
          <CommitInput
            key={name}
            type="text"
            inputMode="text"
            size="sm"
            width="72"
            minW="0"
            maxLength={80}
            value={name}
            disabled={pending}
            onCommit={(value) =>
              startTransition(async () => {
                const result = await updatePlan(planId, { name: value })
                setError(result.errors[0] ?? null)
              })
            }
          />
        </Field.Root>
        <Text textStyle="sm" color="fg.muted">
          {updated}
        </Text>
      </Flex>
      {error && (
        <Text textStyle="sm" color="fg.error" mt="1">
          {error}
        </Text>
      )}
      {notes && (
        <Text
          mt="3"
          p="3"
          bg="bg.muted"
          rounded="l2"
          borderStartWidth="3px"
          borderColor="teal.solid"
        >
          {notes}
        </Text>
      )}
    </Box>
  )
}
