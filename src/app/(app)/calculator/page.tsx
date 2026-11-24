import type { Metadata } from 'next'
import { NotPorted } from '@/components/layout/not_ported'
import { PageHeader } from '@/components/layout/page_header'

export const metadata: Metadata = { title: 'Calculadora' }

export default function Page() {
  return (
    <>
      <PageHeader
        title="Calculadora"
        description="O custo de qualquer item, até a matéria-prima."
      />
      <NotPorted area="Calculadora" />
    </>
  )
}
