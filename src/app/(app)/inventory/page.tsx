import type { Metadata } from 'next'
import { InventoryList } from '@/components/inventory/inventory_list'
import { InventoryStatus } from '@/components/inventory/inventory_status'
import { EmptyNotice } from '@/components/layout/empty_notice'
import { LinkButton } from '@/components/layout/link_button'
import { LinkTabs } from '@/components/layout/link_tabs'
import { PageHeader } from '@/components/layout/page_header'
import { formatAgo } from '@/lib/format'
import { requireUser } from '@/lib/session'
import { lastSuccessfulSyncRun, latestSyncRun, SYNC_STATUS_LABELS } from '@/models/sync_run'
import { inventoryFreshness } from '@/services/game_sync/stale_sync'
import { inventoryScope } from '@/services/inventory/scope'
import { inventoryListing, type InventoryTab } from '@/services/inventory/stock'
import { inventorySearchSchema } from '@/validators/inventory'
import { parseSearchParams, type SearchParams } from '@/validators/search_params'

export const metadata: Metadata = { title: 'Inventário' }

/** The first tab is the default */
const TABS: { value: InventoryTab; label: string }[] = [
  { value: 'professions', label: 'Por profissão' },
  { value: 'all', label: 'Tudo' },
  { value: 'places', label: 'Por local' },
]

const hrefFor = (tab: InventoryTab, q: string) => {
  const params = new URLSearchParams()
  if (tab !== TABS[0].value) params.set('tab', tab)
  if (q) params.set('q', q)
  const query = params.toString()
  return query ? `/inventory?${query}` : '/inventory'
}

/**
 * GET /inventory?tab=&q=: the inventory of the account's character as of the
 * last sync with BitJita. It opens with what is saved; when that is old, the
 * page reads BitJita again in the background.
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requireUser()
  const filters = parseSearchParams(inventorySearchSchema, await searchParams)
  const tab = filters.tab ?? TABS[0].value
  const q = filters.q ?? ''

  const scope = await inventoryScope(user.id)
  const [latest, lastGood, freshness, listing] = await Promise.all([
    latestSyncRun(user.id),
    lastSuccessfulSyncRun(user.id),
    inventoryFreshness(scope.playerIds),
    inventoryListing(scope, tab, q),
  ])

  return (
    <>
      <PageHeader
        title="Inventário"
        description="O que o seu personagem tem no jogo, lido da API pública da BitJita. Busque um item ou veja por profissão e por local."
        actions={<LinkButton href="/game_player">Meu personagem</LinkButton>}
      />
      <InventoryStatus
        latest={
          latest && { ago: formatAgo(latest.startedAt), status: SYNC_STATUS_LABELS[latest.status] }
        }
        lastGoodAgo={
          latest && lastGood && latest.id !== lastGood.id ? formatAgo(lastGood.startedAt) : null
        }
        notices={(latest?.message ?? '').split('\n').filter(Boolean)}
        stale={freshness.stale}
        hasPlayers={freshness.hasPlayers}
      />
      {freshness.hasPlayers ? (
        <>
          <LinkTabs
            label="Visão do inventário"
            tabs={TABS.map((t) => ({
              label: t.label,
              href: hrefFor(t.value, q),
              active: t.value === tab,
            }))}
          />
          <InventoryList key={tab} tab={tab} q={q} sections={listing.sections} />
        </>
      ) : (
        <EmptyNotice>
          Nenhum personagem ainda. Informe o seu em &quot;Meu personagem&quot; para ler o
          inventário.
        </EmptyNotice>
      )}
    </>
  )
}
