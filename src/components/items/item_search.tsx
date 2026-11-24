'use client'

import { HStack, Input, Spinner, Text, Wrap } from '@chakra-ui/react'
import { ItemChip } from '@/components/items/item_chip'
import { useUrlFilters } from '@/components/search/use_url_filters'
import type { ItemSearchResult } from '@/models/item'

/** The search box of /items and the items found, as chips */
export function ItemSearch({ q, items }: { q: string; items: ItemSearchResult[] }) {
  const { updateLater, pending } = useUrlFilters()
  return (
    <>
      <HStack mb="4" gap="2">
        <Input
          type="search"
          size="sm"
          maxW="md"
          bg="bg"
          defaultValue={q}
          placeholder="Nome do item (ex.: plank, ingot)"
          aria-label="Buscar item"
          autoComplete="off"
          autoFocus
          onChange={(event) => updateLater({ q: event.currentTarget.value.trim() })}
        />
        {pending && <Spinner size="sm" color="fg.muted" />}
      </HStack>
      {items.length ? (
        <Wrap gap="1.5">
          {items.map((item) => (
            <ItemChip key={item.id} item={item} />
          ))}
        </Wrap>
      ) : (
        <Text color="fg.muted">
          {q.length >= 2 ? 'Nenhum item encontrado.' : 'Digite pelo menos 2 letras.'}
        </Text>
      )}
    </>
  )
}
