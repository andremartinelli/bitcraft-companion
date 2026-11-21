import type { ItemKind } from '#models/item'
import type { RecipeKind } from '#models/recipe'

/**
 * Pure functions that turn the game's raw JSON into rows for our tables.
 * Nothing here touches the database.
 */

export class GameDataFormatError extends Error {}

/** Item and cargo ids overlap in the game, so they are keyed by kind too */
export type ItemKey = `${ItemKind}:${number}`

export const itemKey = (kind: ItemKind, gameId: number): ItemKey => `${kind}:${gameId}`

interface RawStack {
  item_id: number
  quantity: number
  item_type: string
}

const stackKey = (stack: RawStack) =>
  itemKey(stack.item_type === 'Cargo' ? 'cargo' : 'item', stack.item_id)

export interface StackRow {
  key: ItemKey
  quantity: number
}

export interface ItemRow {
  kind: ItemKind
  gameId: number
  name: string
  description: string | null
  tier: number
  tag: string | null
  rarity: string | null
  itemListGameId: number | null
}

export interface ItemListRow {
  gameId: number
  name: string
  possibilities: { probability: number; items: StackRow[] }[]
}

export interface RecipeRow {
  kind: RecipeKind
  gameId: number
  name: string
  verb: string
  actionsRequired: number
  timePerAction: number
  staminaPerAction: number
  skillId: number | null
  skillLevel: number | null
  toolTypeId: number | null
  toolTier: number | null
  buildingTypeId: number | null
  buildingTier: number | null
  isPassive: boolean
  hiddenWithoutKnowledge: boolean
  shards: number
  pavingTier: number | null
  inputs: StackRow[]
  outputs: StackRow[]
}

/**
 * Recipe names are templates: {0} is the first thing produced and {1} the
 * first ingredient ("Split {1} into {0}").
 */
export function resolveRecipeName(template: string, outputName?: string, inputName?: string) {
  return template
    .replace('{0}', outputName ?? '')
    .replace('{1}', inputName ?? '')
    .trim()
}

/** The first word of the template: Craft, Scrap, Cook... ("Revert to {0}" is Revert) */
export function verbOf(template: string) {
  return template.trim().split(/\s+/)[0] ?? ''
}

const blankToNull = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null)

export function toItemRows(items: any[], cargo: any[]): ItemRow[] {
  return [
    ...items.map((raw) => ({
      kind: 'item' as const,
      gameId: raw.id,
      name: raw.name,
      description: blankToNull(raw.description),
      tier: raw.tier,
      tag: blankToNull(raw.tag),
      rarity: blankToNull(raw.rarity),
      itemListGameId: raw.item_list_id || null,
    })),
    ...cargo.map((raw) => ({
      kind: 'cargo' as const,
      gameId: raw.id,
      name: raw.name,
      description: blankToNull(raw.description),
      tier: raw.tier,
      tag: blankToNull(raw.tag),
      rarity: blankToNull(raw.rarity),
      itemListGameId: null,
    })),
  ]
}

export function toItemListRows(lists: any[]): ItemListRow[] {
  return lists.map((raw) => ({
    gameId: raw.id,
    name: raw.name,
    possibilities: raw.possibilities.map((possibility: any) => ({
      probability: possibility.probability,
      items: possibility.items.map((stack: RawStack) => ({
        key: stackKey(stack),
        quantity: stack.quantity,
      })),
    })),
  }))
}

/**
 * Every recipe in the game has one skill, at most one tool and at most one
 * station. Rather than silently dropping data, stop when a patch changes that.
 */
function single<T>(values: T[], what: string, kind: RecipeKind, id: number): T | null {
  if (values.length > 1) {
    throw new GameDataFormatError(
      `A receita ${kind} ${id} tem ${values.length} exigências de ${what}; o esquema só guarda uma. ` +
        'Crie uma migration que leve essas exigências para uma tabela própria.'
    )
  }
  return values[0] ?? null
}

function requirements(raw: any, kind: RecipeKind) {
  const level = single<any>(raw.level_requirements ?? [], 'skill', kind, raw.id)
  const tool = single<any>(raw.tool_requirements ?? [], 'ferramenta', kind, raw.id)
  return {
    skillId: level?.skill_id ?? null,
    skillLevel: level?.level ?? null,
    toolTypeId: tool?.tool_type ?? null,
    toolTier: tool?.level ?? null,
  }
}

const round = (value: number) => Math.round(value * 1000) / 1000

export function toCraftingRecipeRows(recipes: any[], names: Map<ItemKey, string>): RecipeRow[] {
  return recipes.map((raw) => {
    const inputs = (raw.consumed_item_stacks as RawStack[]).map((s) => ({
      key: stackKey(s),
      quantity: s.quantity,
    }))
    const outputs = (raw.crafted_item_stacks as RawStack[]).map((s) => ({
      key: stackKey(s),
      quantity: s.quantity,
    }))
    const building = raw.building_requirement ?? null

    return {
      kind: 'crafting' as const,
      gameId: raw.id,
      name: resolveRecipeName(raw.name, names.get(outputs[0]?.key), names.get(inputs[0]?.key)),
      verb: verbOf(raw.name),
      actionsRequired: raw.actions_required,
      timePerAction: round(raw.time_requirement),
      staminaPerAction: round(raw.stamina_requirement),
      ...requirements(raw, 'crafting'),
      buildingTypeId: building?.building_type ?? null,
      buildingTier: building?.tier ?? null,
      isPassive: Boolean(raw.is_passive),
      hiddenWithoutKnowledge: Boolean(raw.hide_without_required_knowledge),
      shards: 0,
      pavingTier: null,
      inputs,
      outputs,
    }
  })
}

export function toConstructionRecipeRows(
  recipes: any[],
  buildingNames: Map<number, string>
): RecipeRow[] {
  return recipes.map((raw) => {
    const stacks = [
      ...(raw.consumed_item_stacks ?? []),
      ...(raw.consumed_cargo_stacks ?? []),
    ] as RawStack[]

    return {
      kind: 'construction' as const,
      gameId: raw.id,
      name: buildingNames.get(raw.building_description_id) ?? raw.name,
      verb: 'Build',
      actionsRequired: raw.actions_required,
      timePerAction: round(raw.time_requirement),
      staminaPerAction: round(raw.stamina_requirement),
      ...requirements(raw, 'construction'),
      buildingTypeId: null,
      buildingTier: null,
      isPassive: false,
      hiddenWithoutKnowledge: false,
      shards: raw.consumed_shards ?? 0,
      pavingTier: raw.required_paving_tier ?? null,
      inputs: stacks.map((s) => ({ key: stackKey(s), quantity: s.quantity })),
      outputs: [],
    }
  })
}
