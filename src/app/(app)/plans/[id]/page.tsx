import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { SyncControls } from '@/components/inventory/sync_controls'
import { PageHeader } from '@/components/layout/page_header'
import { DestroyPlanButton } from '@/components/plans/destroy_plan_button'
import { PlanCalculator } from '@/components/plans/plan_calculator'
import { PlanDetails } from '@/components/plans/plan_details'
import { formatDate } from '@/lib/format'
import { requireUser } from '@/lib/session'
import { authorName, findPlan, toCalculatorState } from '@/models/plan'
import { calculate } from '@/services/calculator/calculate'
import { inventoryFreshness } from '@/services/game_sync/stale_sync'
import { planIdSchema } from '@/validators/plan'

/** The sync on demand runs in this page's actions */
export const maxDuration = 60

interface PlanPageProps {
  params: Promise<{ id: string }>
}

/** Once per request: the title and the page read the same plan */
const loadPlan = cache(async (rawId: string) => {
  const id = planIdSchema.safeParse(rawId)
  return id.success ? findPlan(id.data) : null
})

export async function generateMetadata({ params }: PlanPageProps): Promise<Metadata> {
  const plan = await loadPlan((await params).id)
  return { title: plan?.name ?? 'Plano' }
}

/**
 * GET /plans/[id]: the calculator with the saved state, saving on every
 * change, with the editable name and the notes. A plan that doesn't exist is a 404.
 */
export default async function PlanPage({ params }: PlanPageProps) {
  await requireUser()
  const plan = await loadPlan((await params).id)
  if (!plan) notFound()

  const state = toCalculatorState(plan)
  const [panel, freshness] = await Promise.all([calculate(state), inventoryFreshness()])
  const author = authorName(plan.updatedBy)

  return (
    <>
      <PageHeader
        title={plan.name}
        description="Cada mudança é salva no plano automaticamente."
        actions={<DestroyPlanButton planId={plan.id} name={plan.name} />}
      />
      <PlanDetails
        planId={plan.id}
        name={plan.name}
        updated={`Atualizado em ${formatDate(plan.updatedAt)}${author ? ` por ${author}` : ''}`}
        notes={plan.notes}
      />
      <PlanCalculator
        planId={plan.id}
        state={state}
        panel={panel}
        inventoryControls={
          freshness.hasPlayers && (
            <SyncControls stale={freshness.stale && state.useInventory !== false} />
          )
        }
      />
    </>
  )
}
