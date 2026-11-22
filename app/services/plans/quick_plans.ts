import db from '@adonisjs/lucid/services/db'
import Plan from '#models/plan'
import { HIDDEN_VERBS } from '#models/recipe'
import type User from '#models/user'

export const QUICK_PLAN_KEYS = ['leather', 'cloth', 'metal', 'tools'] as const
export type QuickPlanKey = (typeof QUICK_PLAN_KEYS)[number]

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
 * Plans that add a whole set at once: an armor set (leather, cloth or metal)
 * or every profession's tool, of the chosen tier.
 */
export default class QuickPlans {
  #results?: Promise<CraftResult[]>

  /** The templates with the tiers the game data has, for the Planos page */
  async catalog() {
    const results = await this.#craftResults()
    return TEMPLATES.map((template) => {
      const style = METAL_STYLES[0]
      const tiers = [...new Set(results.map((item) => item.tier))]
        .sort((a, b) => a - b)
        .map((tier) => ({ tier, items: this.#pick(results, template, tier, style) }))
        .filter(({ items }) => items.length > 0)
        .map(({ tier, items }) => ({
          tier,
          material: materialOf(items),
          count: items.length,
          label: `T${tier} · ${materialOf(items)} (${items.length} ${items.length === 1 ? 'item' : 'itens'})`,
        }))
      return {
        key: template.key,
        label: template.label,
        description: template.description,
        styles: template.key === 'metal' ? [...METAL_STYLES] : null,
        tiers,
      }
    }).filter((entry) => entry.tiers.length > 0)
  }

  /** The items of a quick plan, one per slot, by name */
  async items(key: QuickPlanKey, tier: number, style: MetalStyle = METAL_STYLES[0]) {
    const template = TEMPLATES.find((t) => t.key === key)!
    return this.#pick(await this.#craftResults(), template, tier, style)
  }

  /** Creates the plan with one of each item; null when the tier has none */
  async create(key: QuickPlanKey, tier: number, style: MetalStyle, user: User | null) {
    const items = await this.items(key, tier, style)
    if (!items.length) return null

    const template = TEMPLATES.find((t) => t.key === key)!
    const name =
      key === 'metal' ? `${template.planName} ${style} T${tier}` : `${template.planName} T${tier}`
    const plan = await Plan.create({
      name,
      createdById: user?.id ?? null,
      updatedById: user?.id ?? null,
    })
    await plan.saveState(
      {
        targets: items.map((item) => ({ itemId: item.id, quantity: 1 })),
        choices: {},
        owned: {},
        useInventory: true,
      },
      user
    )
    return plan
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

/** "Simple", "Pyrelite": the first word most of the items share */
function materialOf(items: CraftResult[]) {
  const counts = new Map<string, number>()
  for (const item of items) {
    const word = item.name.split(' ')[0]
    counts.set(word, (counts.get(word) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0][0]
}
