import edge from 'edge.js'
import { addCollection, edgeIconify } from 'edge-iconify'
import lucideIcons from '@iconify-json/lucide/icons.json' with { type: 'json' }
import type { DateTime } from 'luxon'

edge.use(edgeIconify)
addCollection(lucideIcons)

/**
 * View helpers. The game data is in English; labels around it are pt-BR.
 */
const RARITY_LABELS: Record<string, string> = {
  Uncommon: 'Incomum',
  Rare: 'Raro',
  Epic: 'Épico',
  Legendary: 'Lendário',
  Mythic: 'Mítico',
}

const numberFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const percentFormat = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 })

/** Rarity in Portuguese; Common shows nothing, since almost everything is common */
edge.global('rarityLabel', (rarity: string | null) =>
  rarity ? (RARITY_LABELS[rarity] ?? null) : null
)
edge.global('formatNumber', (value: number) => numberFormat.format(value))
edge.global('formatPercent', (value: number) => percentFormat.format(value))
edge.global('formatDate', (value: DateTime | null) =>
  value ? value.setLocale('pt-BR').toFormat('dd/MM/yyyy') : ''
)
