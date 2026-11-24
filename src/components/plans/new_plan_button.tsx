'use client'

import { Button, type ButtonProps } from '@chakra-ui/react'
import { useActionState } from 'react'
import { createPlan, type PlanFormState } from '@/app/(app)/plans/actions'

const INITIAL: PlanFormState = { error: null }

/** "Novo plano": creates an empty plan and opens it; every change on it is saved */
export function NewPlanButton({ variant = 'solid' }: { variant?: ButtonProps['variant'] }) {
  const [, action, pending] = useActionState(createPlan, INITIAL)
  return (
    <form action={action}>
      <input type="hidden" name="name" value="Novo plano" />
      <Button type="submit" size="sm" variant={variant} loading={pending}>
        Novo plano
      </Button>
    </form>
  )
}
