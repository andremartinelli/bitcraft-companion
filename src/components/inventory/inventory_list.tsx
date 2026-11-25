'use client'

import { Box, Button, HStack, Input, Spinner, Stack, Table, Text, Wrap } from '@chakra-ui/react'
import { useRef } from 'react'
import { ItemChip } from '@/components/items/item_chip'
import { EmptyNotice } from '@/components/layout/empty_notice'
import { useUrlFilters } from '@/components/search/use_url_filters'
import { DetailsSummary, RememberedDetails } from '@/components/ui/remembered_details'
import { formatNumber } from '@/lib/format'
import type { InventoryTab, StockSection } from '@/services/inventory/stock'

interface InventoryListProps {
  tab: InventoryTab
  q: string
  sections: StockSection[]
}

/** The items of one section. By profession, each line also says where it is and whose */
function StockTable({ section, tab }: { section: StockSection; tab: InventoryTab }) {
  return (
    <Table.ScrollArea borderWidth="1px" rounded="l2" bg="bg">
      <Table.Root size="sm">
        <Table.Body>
          {section.lines.map((line) => (
            <Table.Row key={line.item.id}>
              <Table.Cell width="xs">
                <ItemChip item={line.item} />
              </Table.Cell>
              <Table.Cell textAlign="end" width="24" fontVariantNumeric="tabular-nums">
                {formatNumber(line.quantity)}
              </Table.Cell>
              {tab === 'professions' && (
                <Table.Cell>
                  <Wrap gap="1" rowGap="1">
                    {line.where.map((place, index) => (
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
                </Table.Cell>
              )}
              {tab === 'all' && (
                <Table.Cell color="fg.muted" textStyle="sm">
                  {line.where.length === 1 ? '1 local' : `${line.where.length} locais`}
                </Table.Cell>
              )}
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Table.ScrollArea>
  )
}

/**
 * The search box and the stock, one table per section (a profession, the
 * group, a player, a place). Sections collapse and the browser remembers
 * them, except during a search, which shows every match.
 */
export function InventoryList({ tab, q, sections }: InventoryListProps) {
  const { updateLater, pending } = useUrlFilters()
  const list = useRef<HTMLDivElement>(null)
  const empty = sections.every((section) => !section.lines.length)
  const searching = q !== ''

  const setAll = (open: boolean) =>
    list.current
      ?.querySelectorAll<HTMLDetailsElement>('details')
      .forEach((details) => (details.open = open))

  return (
    <Stack gap="4">
      <HStack gap="2" wrap="wrap">
        <Input
          type="search"
          size="sm"
          maxW="md"
          bg="bg"
          defaultValue={q}
          placeholder="Buscar item (ex.: plank, ingot)"
          aria-label="Buscar item"
          autoComplete="off"
          onChange={(event) => updateLater({ q: event.currentTarget.value.trim() })}
        />
        {pending && <Spinner size="sm" color="fg.muted" />}
        {!empty && tab !== 'all' && (
          <HStack gap="1" ml="auto">
            <Button size="xs" variant="ghost" onClick={() => setAll(true)}>
              Expandir tudo
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setAll(false)}>
              Recolher tudo
            </Button>
          </HStack>
        )}
      </HStack>

      {empty ? (
        <EmptyNotice>
          {searching
            ? `Nenhum item com "${q}" no inventário.`
            : 'Nada no inventário ainda. Clique em "Sincronizar agora".'}
        </EmptyNotice>
      ) : tab === 'all' ? (
        sections.map((section) => <StockTable key={section.key} section={section} tab={tab} />)
      ) : (
        <Box ref={list}>
          {sections.map((section) => (
            <RememberedDetails
              // A search opens every section; after it, each one as it was left
              key={`${section.key}:${searching}`}
              rememberKey={`/inventory:${section.key}`}
              remember={!searching}
              mb="3"
            >
              <DetailsSummary>
                <Text fontWeight="semibold">{section.title}</Text>
                {section.subtitle && (
                  <Text textStyle="sm" color="fg.muted">
                    {section.subtitle}
                  </Text>
                )}
                <Text textStyle="sm" color="fg.muted" ml="auto">
                  {section.lines.length === 1 ? '1 item' : `${section.lines.length} itens`}
                </Text>
              </DetailsSummary>
              <Box pb="1">
                <StockTable section={section} tab={tab} />
              </Box>
            </RememberedDetails>
          ))}
        </Box>
      )}
    </Stack>
  )
}
