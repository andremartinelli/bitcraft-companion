import type { Metadata } from 'next'
import { EmptyNotice } from '@/components/layout/empty_notice'
import { LinkTabs } from '@/components/layout/link_tabs'
import { PageHeader } from '@/components/layout/page_header'
import { Pager } from '@/components/layout/pager'
import { ListCount } from '@/components/recipes/list_count'
import { RecipeFilters } from '@/components/recipes/recipe_filters'
import { RecipeTable } from '@/components/recipes/recipe_table'
import { pageHref, plainQuery } from '@/lib/urls'
import { filterOptions, searchRecipes } from '@/models/recipe'
import { recipeSearchSchema } from '@/validators/recipe'
import { parseSearchParams, type SearchParams } from '@/validators/search_params'

export const metadata: Metadata = { title: 'Receitas' }

/**
 * GET /recipes: search and filters in the query string; Crafting and
 * Construção are two tabs of the same list.
 */
export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const filters = parseSearchParams(recipeSearchSchema, params)
  const kind = filters.kind ?? 'crafting'

  const [{ recipes, total, page, lastPage }, options] = await Promise.all([
    searchRecipes({ ...filters, kind }),
    filterOptions(kind),
  ])

  const query = plainQuery(params)
  return (
    <>
      <PageHeader
        title="Receitas"
        description="Busque por receita, produto ou ingrediente. Clique num item para ver como obter e onde ele é usado."
      />
      <LinkTabs
        label="Tipo de receita"
        tabs={[
          { label: 'Crafting', href: '/recipes', active: kind === 'crafting' },
          {
            label: 'Construção',
            href: '/recipes?kind=construction',
            active: kind === 'construction',
          },
        ]}
      />
      {/* key: a new tab starts with its own filters */}
      <RecipeFilters key={kind} filters={{ ...filters, kind }} options={options} />
      <ListCount total={total} page={page} lastPage={lastPage} one="receita" many="receitas" />
      {total === 0 ? (
        <EmptyNotice>Nenhuma receita com esses filtros.</EmptyNotice>
      ) : (
        <RecipeTable rows={recipes.map((recipe) => ({ recipe }))} />
      )}
      <Pager
        previousHref={page > 1 ? pageHref('/recipes', query, page - 1) : null}
        nextHref={page < lastPage ? pageHref('/recipes', query, page + 1) : null}
      />
    </>
  )
}
