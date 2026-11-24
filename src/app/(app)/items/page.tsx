import type { Metadata } from 'next'
import { NotPorted } from '@/components/layout/not_ported'
import { PageHeader } from '@/components/layout/page_header'

export const metadata: Metadata = { title: 'Itens' }

export default function Page() {
  return (
    <>
      <PageHeader
        title="Itens"
        description="Busque um item para ver como obter e onde ele é usado."
      />
      <NotPorted area="Itens" />
    </>
  )
}
