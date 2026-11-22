import db from '@adonisjs/lucid/services/db'
import Plan from '#models/plan'
import { HIDDEN_VERBS } from '#models/recipe'
import type User from '#models/user'

export const QUICK_PLAN_KEYS = ['leather', 'cloth', 'metal', 'tools', 'homestead'] as const
export type QuickPlanKey = (typeof QUICK_PLAN_KEYS)[number]

/** An item of a quick plan and how many to make */
export interface QuickPlanLine {
  id: number
  name: string
  rarity: string | null
  quantity: number
}

/**
 * Settlement upgrades: the Homestead path (decided 22/11/2026), the small
 * settlement, for the two of them. It starts with the foundation (T1); from
 * T3 on, each tier is a settlement research (claim_tech_desc) that takes
 * items and supplies.
 */
const SETTLEMENT = {
  key: 'homestead' as const,
  label: 'Upgrades de assentamento',
  planName: 'Homestead',
  description: 'A fundação e a pesquisa de cada tier do Homestead, o assentamento pequeno',
  techType: 'Homestead',
}

/**
 * Founding the settlement, which starts at T1. The Settlement Foundation Kit,
 * the cargo that builds the Settlement Totem, comes from the trader Rumbagh
 * for these items (traveler_trade_order_desc 1057802508; the import doesn't
 * read the trades). By game id, as in item_desc.
 */
const FOUNDATION = {
  tier: 1,
  label: 'Fundação',
  planName: 'Fundação do Homestead',
  notes:
    'Troque os itens com o Rumbagh pelo Settlement Foundation Kit e construa a ' +
    'Settlement Totem fora das Safe Meadows (Construction 1 e um Mallet). Quem ' +
    'constrói vira o dono. Depois vem o Homestead T3.',
  items: [
    { gameId: 78117662, quantity: 10 }, // Beginner's Settlement Research
    { gameId: 1, quantity: 5000 }, // Hex Coin
  ],
}

const numberFormat = new Intl.NumberFormat('pt-BR')

/** A step of the settlement (its foundation or a tier's research) and the items it takes */
interface SettlementStep {
  tier: number
  /** In the menu, after "T<tier> · " */
  label: string
  planName: string
  notes: string
  inputs: QuickPlanLine[]
}

/** The two styles of metal armor in every tier */
export const METAL_STYLES = ['Plated', 'Duelist'] as const
export type MetalStyle = (typeof METAL_STYLES)[number]

interface Template {
  key: QuickPlanKey
  label: string
  /** The plan name, before " T<tier>" */
  planName: string
  description: string
  /** Which crafted items belong to it */
  matches: (item: CraftResult, style: MetalStyle) => boolean
  /** One item per slot: the piece (armor) or the profession (tools) */
  slot: (item: CraftResult) => string
}

interface CraftResult {
  id: number
  name: string
  tag: string
  tier: number
  rarity: string | null
  /** Tier of the station its recipe needs (0: by hand, like the Flint tools) */
  station: number
}

const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic']
const rarityRank = (rarity: string | null) => {
  const rank = RARITY_ORDER.indexOf(rarity ?? '')
  return rank === -1 ? RARITY_ORDER.length : rank
}

const ARMOR_TAGS = ['Leather Clothing', 'Cloth Clothing', 'Metal Armor']

export const TEMPLATES: Template[] = [
  {
    key: 'leather',
    label: 'Set de couro completo',
    planName: 'Set de couro',
    description: 'Belt, Boots, Cap, Gloves, Leggings e Shirt (Leatherworking)',
    matches: (item) => item.tag === 'Leather Clothing',
    slot: (item) => item.name,
  },
  {
    key: 'cloth',
    label: 'Set de cloth completo',
    planName: 'Set de cloth',
    description: 'Belt, Cap, Gloves, Shirt, Shoes e Shorts (Tailoring)',
    matches: (item) => item.tag === 'Cloth Clothing',
    slot: (item) => item.name,
  },
  {
    key: 'metal',
    label: 'Set de minério completo',
    planName: 'Set de minério',
    description: 'Armor, Belt, Boots, Bracers, Helm e Legguards (Smithing)',
    matches: (item, style) => item.tag === 'Metal Armor' && item.name.includes(` ${style} `),
    slot: (item) => item.name,
  },
  {
    key: 'tools',
    label: 'Ferramentas',
    planName: 'Ferramentas',
    description: 'Uma ferramenta de cada profissão',
    matches: (item) => item.tag.endsWith(' Tool'),
    slot: (item) => item.tag,
  },
]

/**
 * Plans that add many things at once, for the chosen tier: an armor set
 * (leather, cloth or metal), every profession's tool, or what founding the
 * settlement or its (Homestead) research takes.
 */
export default class QuickPlans {
  #results?: Promise<CraftResult[]>
  #steps?: Promise<SettlementStep[]>

  /** The templates with the tiers the game data has, for the Planos page */
  async catalog() {
    const results = await this.#craftResults()
    const craft = TEMPLATES.map((template) => {
      const style = METAL_STYLES[0]
      const tiers = [...new Set(results.map((item) => item.tier))]
        .sort((a, b) => a - b)
        .map((tier) => ({ tier, items: this.#pick(results, template, tier, style) }))
        .filter(({ items }) => items.length > 0)
        .map(({ tier, items }) => tierOption(tier, materialOf(items), items.length))
      return {
        key: template.key,
        label: template.label,
        description: template.description,
        styles: template.key === 'metal' ? [...METAL_STYLES] : null,
        tiers,
      }
    })

    const steps = await this.#settlementSteps()
    const settlement = {
      key: SETTLEMENT.key,
      label: SETTLEMENT.label,
      description: SETTLEMENT.description,
      styles: null,
      tiers: steps
        .filter((step) => step.inputs.length > 0)
        .map((step) => tierOption(step.tier, step.label, step.inputs.length)),
    }
    return [...craft, settlement].filter((entry) => entry.tiers.length > 0)
  }

  /**
   * The items of a quick plan: one of each piece or tool, or what founding
   * the settlement (T1) or its research of that tier takes.
   */
  async items(
    key: QuickPlanKey,
    tier: number,
    style: MetalStyle = METAL_STYLES[0]
  ): Promise<QuickPlanLine[]> {
    if (key === SETTLEMENT.key) {
      const steps = await this.#settlementSteps()
      return steps.find((step) => step.tier === tier)?.inputs ?? []
    }
    const template = TEMPLATES.find((t) => t.key === key)!
    return this.#pick(await this.#craftResults(), template, tier, style).map((item) => ({
      id: item.id,
      name: item.name,
      rarity: item.rarity,
      quantity: 1,
    }))
  }

  /** Creates the plan with the items of the quick plan; null when the tier has none */
  async create(key: QuickPlanKey, tier: number, style: MetalStyle, user: User | null) {
    const items = await this.items(key, tier, style)
    if (!items.length) return null

    let name: string
    let notes: string | null = null
    if (key === SETTLEMENT.key) {
      const steps = await this.#settlementSteps()
      const step = steps.find((s) => s.tier === tier)!
      name = step.planName
      notes = step.notes
    } else {
      const template = TEMPLATES.find((t) => t.key === key)!
      name =
        key === 'metal' ? `${template.planName} ${style} T${tier}` : `${template.planName} T${tier}`
    }

    const plan = await Plan.create({
      name,
      notes,
      createdById: user?.id ?? null,
      updatedById: user?.id ?? null,
    })
    await plan.saveState(
      {
        targets: items.map((item) => ({ itemId: item.id, quantity: item.quantity })),
        choices: {},
        owned: {},
        useInventory: true,
      },
      user
    )
    return plan
  }

  /** The foundation (T1), then the Homestead researches by tier */
  #settlementSteps() {
    this.#steps ??= Promise.all([this.#foundation(), this.#homesteadTechs()]).then(
      ([foundation, techs]) => [foundation, ...techs]
    )
    return this.#steps
  }

  /** What the Rumbagh takes for the kit; no items when one of them left the game */
  async #foundation(): Promise<SettlementStep> {
    const rows = await db
      .from('items')
      .whereNull('removed_at')
      .where('kind', 'item')
      .whereIn(
        'game_id',
        FOUNDATION.items.map((item) => item.gameId)
      )
      .select('id', 'game_id', 'name', 'rarity')
    const inputs = FOUNDATION.items.flatMap(({ gameId, quantity }) => {
      const row = rows.find((r) => Number(r.game_id) === gameId)
      return row ? [{ id: row.id, name: row.name, rarity: row.rarity, quantity }] : []
    })
    return {
      tier: FOUNDATION.tier,
      label: FOUNDATION.label,
      planName: FOUNDATION.planName,
      notes: FOUNDATION.notes,
      inputs: inputs.length === FOUNDATION.items.length ? inputs : [],
    }
  }

  /** The Homestead researches, by tier, with the items each one takes */
  #homesteadTechs() {
    return db
      .from('claim_techs as t')
      .leftJoin('claim_tech_inputs as ti', 'ti.claim_tech_id', 't.id')
      .leftJoin('items as i', 'i.id', 'ti.item_id')
      .whereNull('t.removed_at')
      .where('t.hidden', false)
      .where('t.tech_type', SETTLEMENT.techType)
      .orderBy('t.tier')
      .orderBy('ti.id')
      .select(
        't.tier',
        't.name as tech_name',
        't.supplies_cost',
        'i.id as item_id',
        'i.name as item_name',
        'i.rarity',
        'ti.quantity'
      )
      .then((rows) => {
        const byTier = new Map<number, SettlementStep>()
        for (const row of rows) {
          const step: SettlementStep = byTier.get(row.tier) ?? {
            tier: row.tier,
            label: SETTLEMENT.planName,
            planName: `${SETTLEMENT.planName} T${row.tier}`,
            notes:
              `Pesquisa "${row.tech_name}" do assentamento. Além dos itens, ela custa ` +
              `${numberFormat.format(Number(row.supplies_cost))} de suprimentos do assentamento.`,
            inputs: [],
          }
          if (row.item_id !== null) {
            step.inputs.push({
              id: row.item_id,
              name: row.item_name,
              rarity: row.rarity,
              quantity: Number(row.quantity),
            })
          }
          byTier.set(row.tier, step)
        }
        return [...byTier.values()]
      })
  }

  /**
   * One item per slot. A piece has a craft result per material rarity from T3
   * on: the common one is the default craft. Flint tools are made by hand and
   * Ferralith ones at a station, both T1: the station one is the real tier.
   */
  #pick(results: CraftResult[], template: Template, tier: number, style: MetalStyle) {
    const bySlot = new Map<string, CraftResult>()
    const better = (a: CraftResult, b: CraftResult) =>
      b.station - a.station || rarityRank(a.rarity) - rarityRank(b.rarity) || a.id - b.id
    for (const item of results) {
      if (item.tier !== tier || !template.matches(item, style)) continue
      const slot = template.slot(item)
      const current = bySlot.get(slot)
      if (!current || better(item, current) < 0) bySlot.set(slot, item)
    }
    return [...bySlot.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  /** Items a crafting recipe makes (not by scrapping, recrafting or unpacking) */
  #craftResults() {
    this.#results ??= db
      .from('items as i')
      .join('recipe_outputs as ro', 'ro.item_id', 'i.id')
      .join('recipes as r', 'r.id', 'ro.recipe_id')
      .whereNull('i.removed_at')
      .whereNull('r.removed_at')
      .where('i.kind', 'item')
      .where('r.kind', 'crafting')
      .whereNotIn('r.verb', HIDDEN_VERBS)
      .where((q) => q.whereIn('i.tag', ARMOR_TAGS).orWhere('i.tag', 'like', '% Tool'))
      .groupBy('i.id', 'i.name', 'i.tag', 'i.tier', 'i.rarity')
      .select('i.id', 'i.name', 'i.tag', 'i.tier', 'i.rarity')
      .max('r.building_tier as station')
      .then((rows) => rows.map((row) => ({ ...row, station: Number(row.station ?? 0) })))
    return this.#results
  }
}

/** A tier of the menu: "T2 · Pyrelite", with how many items go in */
function tierOption(tier: number, material: string, count: number) {
  return {
    tier,
    material,
    count,
    label: `T${tier} · ${material} (${count} ${count === 1 ? 'item' : 'itens'})`,
  }
}

/** "Simple", "Pyrelite": the first word most of the items share */
function materialOf(items: CraftResult[]) {
  const counts = new Map<string, number>()
  for (const item of items) {
    const word = item.name.split(' ')[0]
    counts.set(word, (counts.get(word) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0][0]
}
