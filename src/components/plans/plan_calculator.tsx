'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { updatePlan } from '@/app/(app)/plans/actions'
import { CalculatorView, type CalculatorViewProps } from '@/components/calculator/calculator_view'
import type { CalculatorState } from '@/services/calculator/production_planner'
import type { CalculatorPanel } from '@/services/calculator/presenter'

interface PlanCalculatorProps {
  planId: number
  /** The saved state */
  state: CalculatorState
  panel: CalculatorPanel
  inventoryControls?: CalculatorViewProps['inventoryControls']
}

/**
 * The calculator of a plan: every change is saved, then the page shows the
 * saved state calculated again. While it saves, further changes build on the
 * latest one. A state the server refuses saves nothing and shows why.
 */
export function PlanCalculator({ planId, state, panel, inventoryControls }: PlanCalculatorProps) {
  const [pending, startTransition] = useTransition()
  const [latest, setLatest] = useOptimistic(state)
  const [errors, setErrors] = useState<string[]>([])
  // Each refusal draws the panel again, so the fields show the saved values
  const [refusals, setRefusals] = useState(0)

  return (
    <CalculatorView
      key={refusals}
      state={latest}
      panel={panel}
      errors={errors}
      storageKey={`/plans/${planId}`}
      pending={pending}
      pendingLabel="Salvando…"
      inventoryControls={inventoryControls}
      onChange={(next) =>
        startTransition(async () => {
          setLatest(next)
          const result = await updatePlan(planId, { state: next })
          setErrors(result.errors)
          if (result.errors.length) setRefusals((count) => count + 1)
        })
      }
    />
  )
}
