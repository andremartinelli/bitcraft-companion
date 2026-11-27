'use client'

import { useRouter } from 'next/navigation'
import { useOptimistic, useTransition } from 'react'
import { CalculatorView, type CalculatorViewProps } from '@/components/calculator/calculator_view'
import { SavePlanForm } from '@/components/plans/save_plan_form'
import { stateToQuery } from '@/services/calculator/state_params'

type UrlCalculatorProps = Pick<
  CalculatorViewProps,
  'state' | 'panel' | 'errors' | 'inventoryControls' | 'stepsSetting'
>

/**
 * The quick calculator: the whole state lives in the URL, so a link
 * reproduces the calculation. A change replaces the URL and the server
 * calculates again. While it does, further changes build on the latest one.
 * "Salvar como plano" keeps it as a new plan.
 */
export function UrlCalculator({ state, ...props }: UrlCalculatorProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [latest, setLatest] = useOptimistic(state)

  return (
    <CalculatorView
      {...props}
      state={latest}
      storageKey="/calculator"
      pending={pending}
      actions={!props.panel.empty && <SavePlanForm state={state} />}
      onChange={(next) =>
        startTransition(() => {
          setLatest(next)
          const query = stateToQuery(next)
          router.replace(query ? `/calculator?${query}` : '/calculator', { scroll: false })
        })
      }
    />
  )
}
