import type { Metadata } from 'next'
import { EmptyNotice } from '@/components/layout/empty_notice'
import { PageHeader } from '@/components/layout/page_header'
import { NewPlanButton } from '@/components/plans/new_plan_button'
import { PlanTable } from '@/components/plans/plan_table'
import { QuickPlanMenu } from '@/components/plans/quick_plan_menu'
import { formatDate } from '@/lib/format'
import { requireUser } from '@/lib/session'
import { authorName, listPlans } from '@/models/plan'
import { quickPlanCatalog } from '@/services/plans/quick_plans'

export const metadata: Metadata = { title: 'Planos' }

/**
 * GET /plans: the account's plans and the ones shared with it, "Novo plano"
 * and the "Planos rápidos" menu
 */
export default async function PlansPage() {
  const user = await requireUser()
  const [plans, quickPlans] = await Promise.all([listPlans(user.id), quickPlanCatalog()])

  const rows = plans.map((plan) => {
    const author = authorName(plan.updatedBy)
    const { shares, groupShares } = plan._count
    const audience = [
      groupShares && (groupShares === 1 ? 'o grupo' : `${groupShares} grupos`),
      shares && `${shares} ${shares === 1 ? 'conta' : 'contas'}`,
    ].filter(Boolean)
    return {
      id: plan.id,
      name: plan.name,
      count: plan._count.items + plan._count.buildings,
      updated: `${formatDate(plan.updatedAt)}${author ? ` por ${author}` : ''}`,
      sharing:
        plan.createdById !== user.id
          ? `de ${authorName(plan.createdBy) ?? 'outra conta'}`
          : audience.length
            ? `compartilhado com ${audience.join(' e ')}`
            : null,
    }
  })

  return (
    <>
      <PageHeader
        title="Planos"
        description='Os seus planos e os que compartilharam com você. "Novo plano" cria um vazio: adicione itens ou construções, e cada mudança é salva sozinha.'
        actions={<NewPlanButton />}
      />
      {quickPlans.length > 0 && <QuickPlanMenu catalog={quickPlans} />}
      {rows.length > 0 ? (
        <PlanTable plans={rows} />
      ) : (
        <EmptyNotice>
          Nenhum plano ainda. Use &quot;Novo plano&quot;, um plano rápido ou &quot;Salvar como
          plano&quot; na calculadora.
        </EmptyNotice>
      )}
    </>
  )
}
