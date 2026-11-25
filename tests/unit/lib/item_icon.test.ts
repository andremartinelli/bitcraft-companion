import { describe, expect, test } from 'vitest'
import { itemIconUrl } from '@/lib/item_icon'

describe('itemIconUrl', () => {
  test('points at the icon BitJita serves', () => {
    expect(itemIconUrl('GeneratedIcons/Items/Berries')).toBe(
      'https://bitjita.com/GeneratedIcons/Items/Berries.webp'
    )
  })

  test('keeps every icon under GeneratedIcons and drops the sprite settings', () => {
    expect(itemIconUrl('Items/HexCoin[,3,10,500]')).toBe(
      'https://bitjita.com/GeneratedIcons/Items/HexCoin.webp'
    )
  })

  test('encodes each part of the path', () => {
    expect(itemIconUrl('GeneratedIcons/Cargo/Animals/T7 Ocean Fish')).toBe(
      'https://bitjita.com/GeneratedIcons/Cargo/Animals/T7%20Ocean%20Fish.webp'
    )
  })

  test('nothing without an icon', () => {
    expect(itemIconUrl(null)).toBeNull()
    expect(itemIconUrl('')).toBeNull()
  })
})
