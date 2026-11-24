import type { Metadata } from 'next'
import { ItemSearch } from '@/components/items/item_search'
import { PageHeader } from '@/components/layout/page_header'
import { searchItems } from '@/models/item'
import { itemSearchSchema } from '@/validators/item'
import { parseSearchParams, type SearchParams } from '@/validators/search_params'

export const metadata: Metadata = { title: 'Itens' }

/** GET /items?q=: the item search (craftable items first) */
export default async function ItemsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { q } = parseSearchParams(itemSearchSchema, await searchParams)
  const items = await searchItems(q)
  return (
    <>
      <PageHeader
        title="Itens"
        description="Busque um item para ver como obter e onde ele é usado."
      />
      <ItemSearch q={q ?? ''} items={items} />
    </>
  )
}
