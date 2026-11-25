import type { Metadata } from 'next'
import { UrlCalculator } from '@/components/calculator/url_calculator'
import { SyncControls } from '@/components/inventory/sync_controls'
import { PageHeader } from '@/components/layout/page_header'
import { requireUser } from '@/lib/session'
import { withRecipeChoices } from '@/models/user_recipe_choice'
import { calculate } from '@/services/calculator/calculate'
import { readStateFromQuery } from '@/services/calculator/state_params'
import { inventoryFreshness } from '@/services/game_sync/stale_sync'
import type { SearchParams } from '@/validators/search_params'

export const metadata: Metadata = { title: 'Calculadora' }

/**
 * GET /calculator?t=157x10...: the quick calculator. The state is in the
 * URL; nothing is saved. Invalid values show their message instead of failing.
 * Items the URL chose no recipe for use the account's (Trocar receita).
 */
export default async function CalculatorPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requireUser()
  const { state, errors } = readStateFromQuery(await searchParams)
  const [panel, freshness] = await Promise.all([
    // The account's recipes where the URL chose none; the URL keeps only its own
    withRecipeChoices(state, user.id).then((withChoices) => calculate(withChoices, user.id)),
    inventoryFreshness(user.id),
  ])
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
