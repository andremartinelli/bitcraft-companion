'use client'

import { Badge, Box, Text } from '@chakra-ui/react'
import NextLink from 'next/link'
import type { ReactNode } from 'react'
import { formatNumber, rarityLabel } from '@/lib/format'

/** The rarities that show (Common shows nothing), each with its color */
const RARITY_COLORS: Record<string, string> = {
  Uncommon: 'green',
  Rare: 'blue',
  Epic: 'purple',
  Legendary: 'orange',
  Mythic: 'red',
}

export interface ChipItem {
  id: number
  name: string
  tier: number
  rarity: string | null
}

interface ItemChipProps {
  item: ChipItem
  /** "2×" before the name */
  quantity?: number | null
  /** Something the recipe produces: tinted with the accent color */
  output?: boolean
}

function Chip({ output, children }: { output?: boolean; children: ReactNode }) {
  return (
    <Box
      as="span"
      display="inline-flex"
      alignItems="center"
      gap="1.5"
      px="2"
      py="0.5"
      rounded="md"
      borderWidth="1px"
      borderColor={output ? 'colorPalette.muted' : 'border'}
      bg={output ? 'colorPalette.subtle' : 'bg'}
      textStyle="sm"
      lineHeight="short"
    >
      {children}
    </Box>
  )
}

/** Link to an item page: "2× Rough Plank T1 Raro" */
export function ItemChip({ item, quantity, output }: ItemChipProps) {
  const rarity = rarityLabel(item.rarity)
  return (
    <NextLink href={`/items/${item.id}`} className="item-chip">
      <Chip output={output}>
        {quantity !== undefined && quantity !== null && (
          <Text as="span" fontWeight="semibold" fontVariantNumeric="tabular-nums">
            {formatNumber(quantity)}×
          </Text>
        )}
        <Text as="span" _hover={{ textDecoration: 'underline' }}>
          {item.name}
        </Text>
        {item.tier > 0 && (
          <Badge size="xs" variant="outline" colorPalette="gray">
            T{item.tier}
          </Badge>
        )}
        {rarity && (
          <Badge size="xs" colorPalette={RARITY_COLORS[item.rarity!] ?? 'gray'}>
            {rarity}
          </Badge>
        )}
      </Chip>
    </NextLink>
  )
}

/** A name that is not an item page (a building): same look, no link */
export function StaticChip({ children, output }: { children: ReactNode; output?: boolean }) {
  return <Chip output={output}>{children}</Chip>
}
