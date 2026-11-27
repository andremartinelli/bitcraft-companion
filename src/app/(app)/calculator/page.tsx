import type { Metadata } from 'next'
import { UrlCalculator } from '@/components/calculator/url_calculator'
import { NoCharacterNotice } from '@/components/game_players/no_character_notice'
import { SyncControls } from '@/components/inventory/sync_controls'
import { PageHeader } from '@/components/layout/page_header'
import { requireUser } from '@/lib/session'
import { stepsSettingOf } from '@/models/user_profession'
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
  const scope = await inventoryScope(user.id)
  const { playerIds, hasMine } = scope
  const [panel, freshness, stepsSetting] = await Promise.all([
    // The account's recipes where the URL chose none; the URL keeps only its own
    withRecipeChoices(state, user.id).then((withChoices) => calculate(withChoices, scope)),
    inventoryFreshness(playerIds),
    // The account's default: nothing to choose per calculation
    stepsSettingOf(user.id),
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
        stepsSetting={stepsSetting}
        errors={errors}
        inventoryControls={
          // Keyed: a fragment from a server component reaches the client as a list
          <>
            {!hasMine && <NoCharacterNotice key="no-character" />}
            {freshness.hasPlayers && <SyncControls key="sync" stale={freshness.stale} />}
          </>
        }
      />
    </>
  )
}
