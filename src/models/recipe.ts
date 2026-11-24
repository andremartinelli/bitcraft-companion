import type { Prisma, RecipeKind } from '@/generated/prisma/client.ts'
import { db } from '@/lib/db'
import { containsWord, searchWords } from '@/lib/search'

/**
 * Recipes that take things apart, rebuild gear or (un)pack goods. They are
 * almost half of all recipes, so lists hide them unless asked.
 */
export const HIDDEN_VERBS = [
  'Scrap',
  'Recraft',
  'Unpack',
  'Package',
  'Pack',
  'Reforge',
  'Salvage',
  'Revert',
]

export const RECIPES_PER_PAGE = 50

export interface RecipeFilters {
  q?: string
  kind?: RecipeKind
  skill?: number
  station?: number
  tier?: number
  verb?: string
  all?: boolean
  page?: number
}

/** An item as the pages show it: a chip with name, tier and rarity */
export const itemSummary = {
  select: { id: true, name: true, tier: true, rarity: true, kind: true },
} satisfies Prisma.ItemDefaultArgs

export type ItemSummary = Prisma.ItemGetPayload<typeof itemSummary>

/**
 * Everything a recipe list shows: requirements, ingredients and outputs,
 * with random outputs expanded into their possibilities.
 */
export const recipeDetails = {
  skill: { select: { name: true } },
  toolType: { select: { name: true } },
  buildingType: { select: { name: true } },
  inputs: { orderBy: { id: 'asc' }, select: { quantity: true, item: itemSummary } },
  outputs: {
    orderBy: { id: 'asc' },
    select: {
      quantity: true,
      item: {
        select: {
          ...itemSummary.select,
          itemList: {
            select: {
              possibilities: {
                orderBy: { position: 'asc' },
                select: {
                  probability: true,
                  items: { orderBy: { id: 'asc' }, select: { quantity: true, item: itemSummary } },
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.RecipeInclude

export type RecipeWithDetails = Prisma.RecipeGetPayload<{ include: typeof recipeDetails }>

/**
 * Text search matches the recipe name, an ingredient or anything it can
 * produce (including the contents of random outputs). Every word must match.
 */
export function recipeSearchWhere(filters: RecipeFilters): Prisma.RecipeWhereInput {
  const where: Prisma.RecipeWhereInput = { removedAt: null, kind: filters.kind ?? 'crafting' }

  if (filters.verb) where.verb = filters.verb
  else if (!filters.all) where.verb = { notIn: HIDDEN_VERBS }

  if (filters.skill) where.skillId = filters.skill
  if (filters.station) where.buildingTypeId = filters.station
  if (filters.tier !== undefined) where.buildingTier = filters.tier

  where.AND = searchWords(filters.q).map((word) => {
    const named = { name: containsWord(word) }
    return {
      OR: [
        named,
        { inputs: { some: { item: named } } },
        {
          outputs: {
            some: {
              item: {
                OR: [
                  named,
                  {
                    itemList: {
                      possibilities: { some: { items: { some: { item: named } } } },
                    },
                  },
                ],
              },
            },
          },
        },
      ],
    }
  })
  return where
}

/** A page of the recipe list (50 per page), by name */
export async function searchRecipes(filters: RecipeFilters) {
  const where = recipeSearchWhere(filters)
  const total = await db.recipe.count({ where })
  const lastPage = Math.max(1, Math.ceil(total / RECIPES_PER_PAGE))
  const page = Math.min(Math.max(1, filters.page ?? 1), lastPage)
  const recipes = await db.recipe.findMany({
    where,
    include: recipeDetails,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    skip: (page - 1) * RECIPES_PER_PAGE,
    take: RECIPES_PER_PAGE,
  })
  return { recipes, total, page, lastPage }
}

/**
 * Values for the filter dropdowns, from the active recipes of one kind.
 */
export async function filterOptions(kind: RecipeKind) {
  const recipes = { some: { removedAt: null, kind } }
  const [skills, stations, verbs, tiers] = await Promise.all([
    db.skill.findMany({
      where: { recipes },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    db.buildingType.findMany({
      where: { recipes },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    db.recipe.findMany({
      where: { removedAt: null, kind },
      distinct: ['verb'],
      select: { verb: true },
      orderBy: { verb: 'asc' },
    }),
    db.recipe.findMany({
      where: { removedAt: null, kind, buildingTier: { not: null } },
      distinct: ['buildingTier'],
      select: { buildingTier: true },
      orderBy: { buildingTier: 'asc' },
    }),
  ])
  return {
    skills,
    stations,
    verbs: verbs.map((row) => row.verb),
    tiers: tiers.map((row) => row.buildingTier!),
  }
}

export type RecipeFilterOptions = Awaited<ReturnType<typeof filterOptions>>
