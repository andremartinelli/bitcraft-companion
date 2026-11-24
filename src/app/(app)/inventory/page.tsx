import type { Metadata } from 'next'
import { NotPorted } from '@/components/layout/not_ported'
import { PageHeader } from '@/components/layout/page_header'

export const metadata: Metadata = { title: 'Inventário' }

export default function Page() {
  return (
    <>
      <PageHeader title="Inventário" description="O que o grupo tem no jogo, lido da BitJita." />
      <NotPorted area="Inventário" />
    </>
  )
}
