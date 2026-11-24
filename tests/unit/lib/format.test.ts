import { describe, expect, test } from 'vitest'
import { formatAgo, formatDate, formatNumber, formatPercent, rarityLabel } from '@/lib/format'

describe('format', () => {
  test('numbers and percentages in pt-BR', () => {
    expect(formatNumber(1234.5)).toBe('1.234,5')
    expect(formatNumber(2 / 3)).toBe('0,67')
    expect(formatPercent(0.125)).toBe('12,5%')
  })

  test('dates in São Paulo time, not in the server UTC', () => {
    // 01:30 UTC on the 22nd is still the 21st in São Paulo
    expect(formatDate(new Date('2026-11-22T01:30:00Z'))).toBe('21/11/2026')
    expect(formatDate(null)).toBe('')
  })

  test('how long ago, in Portuguese', () => {
    const now = new Date('2026-11-24T12:00:00Z')
    expect(formatAgo(new Date('2026-11-24T11:55:00Z'), now)).toBe('há 5 minutos')
    expect(formatAgo(new Date('2026-11-23T12:00:00Z'), now)).toBe('ontem')
  })

  test('rarity: common shows nothing', () => {
    expect(rarityLabel('Common')).toBeNull()
    expect(rarityLabel('Rare')).toBe('Raro')
    expect(rarityLabel(null)).toBeNull()
  })
})
