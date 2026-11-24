'use client'

import { Badge, Button, Heading, HStack, Stack, Text } from '@chakra-ui/react'
import NextLink from 'next/link'
import { PageHeader } from '@/components/layout/page_header'
import { RecipeTable, type RecipeTableRow } from '@/components/recipes/recipe_table'
import { rarityLabel } from '@/lib/format'

interface ItemDetailsProps {
  item: {
    id: number
    name: string
    tier: number
    rarity: string | null
    kind: 'item' | 'cargo'
    tag: string | null
    description: string | null
  }
  /** Recipes that make it, each with how much per craft ("Como obter") */
  producers: RecipeTableRow[]
  /** Recipes that take it ("Usado em") */
  consumers: RecipeTableRow[]
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
export function ItemDetails({ item, producers, consumers }: ItemDetailsProps) {
  const rarity = rarityLabel(item.rarity)
  return (
    <>
      <PageHeader
        title={item.name}
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

      <Section
        title="Como obter"
        rows={producers}
        empty="Nenhuma receita produz este item: ele vem de coleta, drop ou loja."
      />
      <Section title="Usado em" rows={consumers} empty="Não é ingrediente de nenhuma receita." />
    </>
  )
}
