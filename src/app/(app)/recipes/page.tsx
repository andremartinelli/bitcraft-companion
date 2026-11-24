import type { Metadata } from 'next'
import { NotPorted } from '@/components/layout/not_ported'
import { PageHeader } from '@/components/layout/page_header'

export const metadata: Metadata = { title: 'Receitas' }

export default function Page() {
  return (
    <>
      <PageHeader title="Receitas" description="Busque por receita, produto ou ingrediente." />
      <NotPorted area="Receitas" />
    </>
  )
}
