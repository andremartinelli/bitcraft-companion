'use client'

import { Badge, Box, Button, Heading, HStack, Link, Stack, Text, Wrap } from '@chakra-ui/react'
import NextLink from 'next/link'
import { ItemIcon } from '@/components/items/item_icon'
import { PageHeader } from '@/components/layout/page_header'
import { RecipeTable, type RecipeTableRow } from '@/components/recipes/recipe_table'
import { formatNumber, rarityLabel } from '@/lib/format'
import type { ItemPlace } from '@/services/inventory/stock'

interface ItemDetailsProps {
  item: {
    id: number
    name: string
    tier: number
    rarity: string | null
    iconAssetName: string | null
    kind: 'item' | 'cargo'
    tag: string | null
    description: string | null
  }
  /** Recipes that make it, each with how much per craft ("Como obter") */
  producers: RecipeTableRow[]
  /** Recipes that take it ("Usado em") */
  consumers: RecipeTableRow[]
  /** How many the group has and where, once there is a sync */
  stock: { total: number; places: ItemPlace[] } | null
}

function Section({ title, empty, rows }: { title: string; empty: string; rows: RecipeTableRow[] }) {
  return (
    <Stack as="section" gap="3" mt="8">
      <Heading as="h2" size="lg">
        {title} ({rows.length})
      </Heading>
      {rows.length ? <RecipeTable rows={rows} /> : <Text color="fg.muted">{empty}</Text>}
    </Stack>
  )
}

/** The item page: what it is, how to get it and where it is used */
export function ItemDetails({ item, producers, consumers, stock }: ItemDetailsProps) {
  const rarity = rarityLabel(item.rarity)
  return (
    <>
      <PageHeader
        title={item.name}
        icon={<ItemIcon assetName={item.iconAssetName} size="12" />}
        actions={
          <Button asChild size="sm">
            <NextLink href={`/calculator?t=${item.id}x1`}>Calcular custo</NextLink>
          </Button>
        }
      />
      <HStack gap="2" mt="-4" mb="3" wrap="wrap">
        {item.tier > 0 && <Badge variant="outline">T{item.tier}</Badge>}
        {rarity && <Badge>{rarity}</Badge>}
        <Text textStyle="sm" color="fg.muted">
          {item.kind === 'cargo' ? 'Cargo' : 'Item'}
          {item.tag && ` · ${item.tag}`}
        </Text>
      </HStack>
      {item.description && <Text maxW="3xl">{item.description}</Text>}

      {stock && (
        <Box as="section" mt="6" p="4" borderWidth="1px" rounded="l2" bg="bg" maxW="3xl">
          <Text>
            Você tem: <strong>{formatNumber(stock.total)}</strong>{' '}
            <Link asChild textStyle="sm" color="fg.muted">
              <NextLink href="/inventory">ver inventário</NextLink>
            </Link>
          </Text>
          {stock.places.length > 0 && (
            <Wrap gap="1" mt="2">
              {stock.places.map((place, index) => (
                <Text
                  key={index}
                  as="span"
                  textStyle="xs"
                  px="1.5"
                  py="0.5"
                  rounded="l1"
                  bg="bg.muted"
                >
                  <strong>{formatNumber(place.quantity)}</strong> {place.container}{' '}
                  <Text as="span" color="fg.muted">
                    · {place.owner}
                  </Text>
                </Text>
              ))}
            </Wrap>
          )}
        </Box>
      )}

      <Section
        title="Como obter"
        rows={producers}
        empty="Nenhuma receita produz este item: ele vem de coleta, drop ou loja."
      />
      <Section title="Usado em" rows={consumers} empty="Não é ingrediente de nenhuma receita." />
    </>
  )
}
