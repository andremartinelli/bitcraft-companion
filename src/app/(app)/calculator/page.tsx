import type { Metadata } from 'next'
import { UrlCalculator } from '@/components/calculator/url_calculator'
import { SyncControls } from '@/components/inventory/sync_controls'
import { PageHeader } from '@/components/layout/page_header'
import { requireUser } from '@/lib/session'
import { withRecipeChoices } from '@/models/user_recipe_choice'
import { calculate } from '@/services/calculator/calculate'
import { readStateFromQuery } from '@/services/calculator/state_params'
import { inventoryFreshness } from '@/services/game_sync/stale_sync'
import { inventoryScope } from '@/services/inventory/scope'
import type { SearchParams } from '@/validators/search_params'

export const metadata: Metadata = { title: 'Calculadora' }

/**
 * GET /calculator?t=157x10...: the quick calculator. The state is in the
 * URL; nothing is saved. Invalid values show their message instead of failing.
 * Items the URL chose no recipe for use the account's (Trocar receita). The
 * inventory is the account's character.
 */
export default async function CalculatorPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requireUser()
  const { state, errors } = readStateFromQuery(await searchParams)
  const { playerIds } = await inventoryScope(user.id)
  const [panel, freshness] = await Promise.all([
    // The account's recipes where the URL chose none; the URL keeps only its own
    withRecipeChoices(state, user.id).then((withChoices) => calculate(withChoices, playerIds)),
    inventoryFreshness(playerIds),
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
        inventoryControls={freshness.hasPlayers && <SyncControls stale={freshness.stale} />}
      />
    </>
  )
}
