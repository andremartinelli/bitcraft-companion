import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { NoCharacterNotice } from '@/components/game_players/no_character_notice'
import { SyncControls } from '@/components/inventory/sync_controls'
import { PageHeader } from '@/components/layout/page_header'
import { DestroyPlanButton } from '@/components/plans/destroy_plan_button'
import { OnlyMyInventory } from '@/components/plans/only_my_inventory'
import { PlanCalculator } from '@/components/plans/plan_calculator'
import { PlanDetails } from '@/components/plans/plan_details'
import { PlanSharing, SharedPlanNotice } from '@/components/plans/plan_sharing'
import { QuickPlanMenu } from '@/components/plans/quick_plan_menu'
import { formatDate } from '@/lib/format'
import { getCurrentUser, requireUser } from '@/lib/session'
import { listGroups } from '@/models/group'
import { authorName, findPlanFor, toCalculatorState } from '@/models/plan'
import { calculate } from '@/services/calculator/calculate'
import { inventoryFreshness } from '@/services/game_sync/stale_sync'
import { inventoryScope } from '@/services/inventory/scope'
import { quickPlanCatalog } from '@/services/plans/quick_plans'
import { planIdSchema } from '@/validators/plan'

interface PlanPageProps {
  params: Promise<{ id: string }>
}

/** Once per request: the title and the page read the same plan, if the account can open it */
const loadPlan = cache(async (rawId: string, userId: number) => {
  const id = planIdSchema.safeParse(rawId)
  return id.success ? findPlanFor(id.data, userId) : null
})

export async function generateMetadata({ params }: PlanPageProps): Promise<Metadata> {
  const user = await getCurrentUser()
  const plan = user ? await loadPlan((await params).id, user.id) : null
  return { title: plan?.name ?? 'Plano' }
}

/**
 * GET /plans/[id]: the calculator with the saved state, saving on every
 * change, with "Planos rápidos" next to its search, the editable name and
 * the notes. Its inventory is the account's character and those of the
 * plan's people (services/inventory/scope). The owner shares it with its
 * groups and deletes it; an account it was shared with edits it and, when it
 * came one by one, can leave it. A plan that doesn't exist, or is someone
 * else's, is a 404.
 */
export default async function PlanPage({ params }: PlanPageProps) {
  const user = await requireUser()
  const plan = await loadPlan((await params).id, user.id)
  if (!plan) notFound()

  const state = toCalculatorState(plan)
  const owner = plan.createdById === user.id
  const scope = await inventoryScope(user.id, plan.id)
  const [panel, freshness, groups, quickPlans] = await Promise.all([
    calculate(state, scope.playerIds),
    inventoryFreshness(scope.playerIds),
    owner ? listGroups(user.id) : [],
    quickPlanCatalog(),
  ])
  const author = authorName(plan.updatedBy)
  const sharedGroups = new Set(plan.groupShares.map((share) => share.groupId))
  const groupPeople = new Set(groups.flatMap((group) => group.members.map((m) => m.userId)))

  return (
    <>
      <PageHeader
        title={plan.name}
        description="Cada mudança é salva no plano automaticamente."
        actions={owner && <DestroyPlanButton planId={plan.id} name={plan.name} />}
      />
      {owner ? (
        <PlanSharing
          planId={plan.id}
          groups={groups.map((group) => ({
            id: group.id,
            name: group.name,
            shared: sharedGroups.has(group.id),
            members: group.members
              .filter((member) => member.userId !== user.id)
              .map((member) => ({ userId: member.userId, name: authorName(member.user)! })),
          }))}
          sharedWith={plan.shares.map((share) => share.userId)}
          outside={plan.shares
            .filter((share) => !groupPeople.has(share.userId))
            .map((share) => ({ userId: share.userId, name: authorName(share.user)! }))}
        />
      ) : (
        <SharedPlanNotice
          planId={plan.id}
          userId={user.id}
          ownerName={authorName(plan.createdBy) ?? 'outra conta'}
          groupNames={plan.groupShares
            .filter((share) => share.group.members.length > 0)
            .map((share) => share.group.name)}
        />
      )}
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
          // Keyed: a fragment from a server component reaches the client as a list
          <>
            {!scope.hasMine && <NoCharacterNotice key="no-character" />}
            {scope.hasOthers && (
              <OnlyMyInventory key="only-mine" planId={plan.id} checked={scope.onlyMine} />
            )}
            {freshness.hasPlayers && (
              <SyncControls key="sync" stale={freshness.stale} planId={plan.id} />
            )}
          </>
        }
        pickerActions={
          quickPlans.length > 0 && <QuickPlanMenu planId={plan.id} catalog={quickPlans} />
        }
      />
    </>
  )
}
