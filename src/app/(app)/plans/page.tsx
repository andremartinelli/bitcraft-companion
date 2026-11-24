import type { Metadata } from 'next'
import { EmptyNotice } from '@/components/layout/empty_notice'
import { PageHeader } from '@/components/layout/page_header'
import { NewPlanButton } from '@/components/plans/new_plan_button'
import { PlanTable } from '@/components/plans/plan_table'
import { QuickPlanMenu } from '@/components/plans/quick_plan_menu'
import { formatDate } from '@/lib/format'
import { requireUser } from '@/lib/session'
import { authorName, listPlans } from '@/models/plan'
import QuickPlans from '@/services/plans/quick_plans'

export const metadata: Metadata = { title: 'Planos' }

/** GET /plans: the saved plans, "Novo plano" and the "Planos rápidos" menu */
export default async function PlansPage() {
  await requireUser()
  const [plans, quickPlans] = await Promise.all([listPlans(), new QuickPlans().catalog()])

  const rows = plans.map((plan) => {
    const author = authorName(plan.updatedBy)
    return {
      id: plan.id,
      name: plan.name,
      count: plan._count.items + plan._count.buildings,
      updated: `${formatDate(plan.updatedAt)}${author ? ` por ${author}` : ''}`,
    }
  })

  return (
    <>
      <PageHeader
        title="Planos"
        description='Planos salvos, compartilhados entre vocês. "Novo plano" cria um vazio: adicione itens ou construções, e cada mudança é salva sozinha.'
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
