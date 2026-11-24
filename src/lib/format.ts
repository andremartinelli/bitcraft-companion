/**
 * Formatting for the pages. The game data is in English; labels around it
 * are pt-BR. Vercel runs in UTC, so dates are formatted in São Paulo's time.
 */

export const TIME_ZONE = 'America/Sao_Paulo'

const RARITY_LABELS: Record<string, string> = {
  Uncommon: 'Incomum',
  Rare: 'Raro',
  Epic: 'Épico',
  Legendary: 'Lendário',
  Mythic: 'Mítico',
}

const numberFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const percentFormat = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 })
const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
const relativeFormat = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

/** Rarity in Portuguese; Common shows nothing, since almost everything is common */
export function rarityLabel(rarity: string | null | undefined) {
  return rarity ? (RARITY_LABELS[rarity] ?? null) : null
}

export function formatNumber(value: number) {
  return numberFormat.format(value)
}

export function formatPercent(value: number) {
  return percentFormat.format(value)
}

/** "21/11/2026", in São Paulo's time */
export function formatDate(value: Date | null | undefined) {
  return value ? dateFormat.format(value) : ''
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
]

/** "há 5 minutos", "ontem" */
export function formatAgo(value: Date | null | undefined, now: Date = new Date()) {
  if (!value) return ''
  const seconds = Math.round((value.getTime() - now.getTime()) / 1000)
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size || unit === 'second') {
      return relativeFormat.format(Math.trunc(seconds / size), unit)
    }
  }
  return ''
}
