import type { Metadata } from 'next'
import { UrlCalculator } from '@/components/calculator/url_calculator'
import { PageHeader } from '@/components/layout/page_header'
import { calculate } from '@/services/calculator/calculate'
import { readStateFromQuery } from '@/services/calculator/state_params'
import type { SearchParams } from '@/validators/search_params'

export const metadata: Metadata = { title: 'Calculadora' }

/**
 * GET /calculator?t=157x10...: the quick calculator. The state is in the
 * URL; nothing is saved. Invalid values show their message instead of failing.
 */
export default async function CalculatorPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { state, errors } = readStateFromQuery(await searchParams)
  const panel = await calculate(state)
  return (
    <>
      <PageHeader
        title="Calculadora"
        description="A matéria-prima e as etapas até o fim da cadeia, para qualquer item ou construção. O endereço da página guarda o cálculo."
      />
      <UrlCalculator state={state} panel={panel} errors={errors} />
    </>
  )
}
