import type { Metadata } from 'next'
import { NotPorted } from '@/components/layout/not_ported'
import { PageHeader } from '@/components/layout/page_header'

export const metadata: Metadata = { title: 'Planos' }

export default function Page() {
  return (
    <>
      <PageHeader title="Planos" description="Planos salvos, compartilhados entre vocês." />
      <NotPorted area="Planos" />
    </>
  )
}
