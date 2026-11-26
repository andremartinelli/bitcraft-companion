import type { ItemKind, RecipeKind } from '@/generated/prisma/enums.ts'
import type { RawRow } from '@/services/game_data/source'

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
  iconAssetName: string | null
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

export function toItemRows(items: RawRow[], cargo: RawRow[]): ItemRow[] {
  return [
    ...items.map((raw) => ({
      kind: 'item' as const,
      gameId: raw.id,
      name: raw.name,
      description: blankToNull(raw.description),
      tier: raw.tier,
      tag: blankToNull(raw.tag),
      rarity: blankToNull(raw.rarity),
      iconAssetName: blankToNull(raw.icon_asset_name),
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
      iconAssetName: blankToNull(raw.icon_asset_name),
      itemListGameId: null,
    })),
  ]
}

export interface ClaimTechRow {
  gameId: number
  name: string
  description: string | null
  tier: number
  techType: string
  suppliesCost: number
  hidden: boolean
  inputs: StackRow[]
}

/** Settlement researches (claim_tech_desc): what each one takes, in items and supplies */
export function toClaimTechRows(techs: RawRow[]): ClaimTechRow[] {
  return techs.map((raw) => {
    if (typeof raw.id !== 'number' || typeof raw.name !== 'string' || !Array.isArray(raw.input)) {
      throw new GameDataFormatError(`claim_tech_desc: linha sem id, name ou input (${raw.id})`)
    }
    return {
      gameId: raw.id,
      name: raw.name,
      description: blankToNull(raw.description),
      tier: raw.tier ?? 0,
      techType: raw.tech_type ?? 'Undefined',
      suppliesCost: raw.supplies_cost ?? 0,
      hidden: Boolean(raw.not_shown_in_ui || raw.cannot_be_researched),
      inputs: (raw.input as RawStack[]).map((s) => ({ key: stackKey(s), quantity: s.quantity })),
    }
  })
}

export interface TravelerTaskRow {
  gameId: number
  traveler: string | null
  skillId: number
  minLevel: number
  tier: number
  description: string
  inputs: StackRow[]
}

/** The tier of a skill level, and so of the tasks that take it: 20 → T2 ... 100 → T10, below 20 → T1 */
export const levelTier = (level: number) => Math.min(10, Math.max(1, Math.floor(level / 10)))

/**
 * Travelers' tasks (traveler_task_desc): the items each one asks for. The
 * traveler is the NPC (npc_desc) whose tasks give XP in the task's skill.
 */
export function toTravelerTaskRows(tasks: RawRow[], npcs: RawRow[]): TravelerTaskRow[] {
  const travelers = new Map<number, string>(
    npcs.flatMap((npc: RawRow) =>
      (npc.task_skill_check ?? []).map((skillId: number) => [skillId, npc.name])
    )
  )
  return tasks.map((raw) => {
    const level = raw.level_requirement
    if (
      typeof raw.id !== 'number' ||
      typeof level?.skill_id !== 'number' ||
      !Array.isArray(raw.required_items)
    ) {
      throw new GameDataFormatError(
        `traveler_task_desc: linha sem id, level_requirement ou required_items (${raw.id})`
      )
    }
    const minLevel = level.min_level ?? 1
    return {
      gameId: raw.id,
      traveler: travelers.get(level.skill_id) ?? null,
      skillId: level.skill_id,
      minLevel,
      tier: levelTier(minLevel),
      description: raw.description ?? '',
      inputs: (raw.required_items as RawStack[]).map((s) => ({
        key: stackKey(s),
        quantity: s.quantity,
      })),
    }
  })
}

export interface ExtractionRecipeRow {
  /** A resource in the world (tree, vein, plant) or an enemy (a hunted animal) */
  source: 'resource' | 'enemy'
  gameId: number
  verb: string
  skillId: number | null
  skillLevel: number | null
  toolTypeId: number | null
  toolTier: number | null
  outputs: StackRow[]
}

/**
 * Gathering (extraction_recipe_desc): the skill it takes and the items it
 * gives (often a random-output list, like "T1 Bark Output").
 */
export function toExtractionRecipeRows(recipes: RawRow[]): ExtractionRecipeRow[] {
  return recipes.map((raw) => {
    if (typeof raw.id !== 'number' || !Array.isArray(raw.extracted_item_stacks)) {
      throw new GameDataFormatError(
        `extraction_recipe_desc: linha sem id ou extracted_item_stacks (${raw.id})`
      )
    }
    return {
      source: 'resource' as const,
      gameId: raw.id,
      verb: blankToNull(raw.verb_phrase) ?? 'Gather',
      ...requirements(raw, 'extraction'),
      outputs: extractedStacks(raw.extracted_item_stacks),
    }
  })
}

const extractedStacks = (stacks: { item_stack: RawStack }[]) =>
  stacks.map(({ item_stack: stack }) => ({ key: stackKey(stack), quantity: stack.quantity }))

/**
 * Hunting (enemy_desc): a killed animal leaves its body ("Cervus"), sometimes
 * more. The skill is the one the fight trains (Hunting; Slayer for monsters).
 * Enemies that leave nothing stay out.
 */
export function toHuntingRows(enemies: RawRow[]): ExtractionRecipeRow[] {
  return enemies
    .map((raw) => {
      if (typeof raw.enemy_type !== 'number' || !Array.isArray(raw.extracted_item_stacks)) {
        throw new GameDataFormatError(
          `enemy_desc: linha sem enemy_type ou extracted_item_stacks (${raw.enemy_type})`
        )
      }
      const skill = single<RawRow>(
        raw.experience_per_damage_dealt ?? [],
        'skill',
        'extraction',
        raw.enemy_type
      )
      return {
        source: 'enemy' as const,
        gameId: raw.enemy_type,
        verb: raw.huntable ? 'Hunt' : 'Slay',
        skillId: skill?.skill_id ?? null,
        skillLevel: null,
        toolTypeId: null,
        toolTier: null,
        outputs: extractedStacks(raw.extracted_item_stacks),
      }
    })
    .filter((row) => row.outputs.length > 0)
}

export function toItemListRows(lists: RawRow[]): ItemListRow[] {
  return lists.map((raw) => ({
    gameId: raw.id,
    name: raw.name,
    possibilities: raw.possibilities.map((possibility: RawRow) => ({
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
function single<T>(
  values: T[],
  what: string,
  kind: RecipeKind | 'extraction',
  id: number
): T | null {
  if (values.length > 1) {
    throw new GameDataFormatError(
      `A receita ${kind} ${id} tem ${values.length} exigências de ${what}; o esquema só guarda uma. ` +
        'Crie uma migration que leve essas exigências para uma tabela própria.'
    )
  }
  return values[0] ?? null
}

function requirements(raw: RawRow, kind: RecipeKind | 'extraction') {
  const level = single<RawRow>(raw.level_requirements ?? [], 'skill', kind, raw.id)
  const tool = single<RawRow>(raw.tool_requirements ?? [], 'ferramenta', kind, raw.id)
  return {
    skillId: level?.skill_id ?? null,
    skillLevel: level?.level ?? null,
    toolTypeId: tool?.tool_type ?? null,
    toolTier: tool?.level ?? null,
  }
}

const round = (value: number) => Math.round(value * 1000) / 1000

export function toCraftingRecipeRows(recipes: RawRow[], names: Map<ItemKey, string>): RecipeRow[] {
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
  recipes: RawRow[],
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
