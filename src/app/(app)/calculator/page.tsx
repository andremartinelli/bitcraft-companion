import type { Metadata } from 'next'
import { UrlCalculator } from '@/components/calculator/url_calculator'
import { SyncControls } from '@/components/inventory/sync_controls'
import { PageHeader } from '@/components/layout/page_header'
import { requireUser } from '@/lib/session'
import { calculate } from '@/services/calculator/calculate'
import { readStateFromQuery } from '@/services/calculator/state_params'
import { inventoryFreshness } from '@/services/game_sync/stale_sync'
import type { SearchParams } from '@/validators/search_params'

export const metadata: Metadata = { title: 'Calculadora' }

/** The sync on demand runs in this page's actions */
export const maxDuration = 60

/**
 * GET /calculator?t=157x10...: the quick calculator. The state is in the
 * URL; nothing is saved. Invalid values show their message instead of failing.
 */
export default async function CalculatorPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireUser()
  const { state, errors } = readStateFromQuery(await searchParams)
  const [panel, freshness] = await Promise.all([calculate(state), inventoryFreshness()])
  return (
    <>
      <PageHeader
        title="Calculadora"
        description="A matéria-prima e as etapas até o fim da cadeia, para qualquer item ou construção. O endereço da página guarda o cálculo."
      />
      <UrlCalculator
        state={state}
        panel={panel}
        errors={errors}
        inventoryControls={
          freshness.hasPlayers && (
            // Reads BitJita on its own only when the calculation uses the inventory
            <SyncControls stale={freshness.stale && state.useInventory !== false} />
          )
        }
      />
    </>
  )
}
