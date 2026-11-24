'use client'

import { Button, HStack, Input, Stack, Text } from '@chakra-ui/react'
import { useActionState } from 'react'
import { createPlan, type PlanFormState } from '@/app/(app)/plans/actions'
import type { CalculatorState } from '@/services/calculator/production_planner'
import { stateToQuery } from '@/services/calculator/state_params'

const INITIAL: PlanFormState = { error: null }

/**
 * "Salvar como plano" in the quick calculator: a new plan with this state
 * (sent as the calculator's URL query), opened right away.
 */
export function SavePlanForm({ state }: { state: CalculatorState }) {
  const [result, action, pending] = useActionState(createPlan, INITIAL)
  return (
    <form action={action}>
      <Stack gap="1">
        <HStack gap="2">
          <input type="hidden" name="state" value={stateToQuery(state)} />
          <Input
            name="name"
            size="sm"
            width="64"
            maxLength={80}
            required
            defaultValue={result.name}
            placeholder="Nome do plano, ex.: Ferramentas T2"
            aria-label="Nome do plano"
          />
          <Button type="submit" size="sm" variant="outline" loading={pending}>
            Salvar como plano
          </Button>
        </HStack>
        {result.error && (
          <Text textStyle="sm" color="fg.error">
            {result.error}
          </Text>
        )}
      </Stack>
    </form>
  )
}
