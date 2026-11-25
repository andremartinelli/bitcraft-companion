'use client'

import { Badge, Box, Button, Field, Flex, Input, Spinner, Text, Wrap } from '@chakra-ui/react'
import { useEffect, useRef, useState, type ClipboardEvent, type ReactNode } from 'react'
import { ItemIcon } from '@/components/items/item_icon'
import { rarityLabel } from '@/lib/format'
import type { BuildingSearchResult, ItemSearchResult } from '@/models/item'
import { looksLikeList, type ResolvedList } from '@/services/calculator/item_list'

interface ItemPickerProps {
  onAddItem: (itemId: number) => void
  onAddBuilding: (recipeId: number) => void
  /** A pasted list, resolved: adds all of it, or returns why it can't */
  onAddList: (list: ResolvedList) => string[]
  /** Next to the field: "Planos rápidos" in a plan */
  actions?: ReactNode
}

interface Suggestions {
  q: string
  items: ItemSearchResult[]
  buildings: BuildingSearchResult[]
}

/**
 * "Adicionar item ou construção": suggestions while typing, from
 * /api/items/search. A click adds it to the calculation.
 */
export function ItemPicker({ onAddItem, onAddBuilding, onAddList, actions }: ItemPickerProps) {
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null)
  const [loading, setLoading] = useState(false)
  const [listErrors, setListErrors] = useState<string[]>([])
  const input = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const request = useRef<AbortController | null>(null)
  // The list arrives after a request: add it to the state as it is then, not at the paste
  const addList = useRef(onAddList)
  useEffect(() => {
    addList.current = onAddList
  })

  const search = (q: string) => {
    setListErrors([])
    if (timer.current) clearTimeout(timer.current)
    request.current?.abort()
    if (q.trim().length < 2) {
      setSuggestions(null)
      setLoading(false)
      return
    }
    timer.current = setTimeout(async () => {
      const controller = new AbortController()
      request.current = controller
      setLoading(true)
      try {
        const response = await fetch(`/api/items/search?q=${encodeURIComponent(q.trim())}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(String(response.status))
        setSuggestions({ q, ...(await response.json()) })
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setSuggestions({ q, items: [], buildings: [] })
      } finally {
        if (request.current === controller) setLoading(false)
      }
    }, 250)
  }

  /**
   * A list (several lines, JSON, or "10 Rough Plank") is read from the
   * clipboard: a one-line input would drop its line breaks. All or nothing.
   */
  const paste = async (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text')
    if (!looksLikeList(text)) return
    event.preventDefault()
    search('')
    setLoading(true)
    try {
      const response = await fetch('/api/items/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const body = await response.json()
      const errors: string[] = !response.ok
        ? (body.errors ?? [body.error ?? 'Não deu para ler a lista agora. Tente colar de novo.'])
        : body.errors.length
          ? body.errors
          : addList.current(body as ResolvedList)
      setListErrors(errors)
      if (!errors.length && input.current) input.current.value = ''
    } catch {
      setListErrors(['Não deu para ler a lista agora. Tente colar de novo.'])
    } finally {
      setLoading(false)
    }
  }

  const pick = (add: () => void) => {
    add()
    setSuggestions(null)
    if (input.current) input.current.value = ''
  }

  return (
    <Box mb="4">
      <Field.Root invalid={listErrors.length > 0}>
        <Field.Label>Adicionar item ou construção</Field.Label>
        <Flex gap="2" align="start" wrap="wrap" width="full">
          <Box position="relative" flex="1" minW="60" maxW="xl">
            <Input
              ref={input}
              type="search"
              bg="bg"
              placeholder="Ex.: Pyrelite Axe, Simple Plank, Rough Loom"
              autoComplete="off"
              onChange={(event) => search(event.currentTarget.value)}
              onPaste={paste}
            />
            {loading && (
              <Spinner size="xs" position="absolute" right="3" top="3" color="fg.muted" />
            )}
          </Box>
          {actions}
        </Flex>
        {listErrors.length > 0 ? (
          <Field.ErrorText display="block">
            Nada foi adicionado. Corrija a lista e cole de novo:
            {listErrors.map((message) => (
              <Text key={message}>{message}</Text>
            ))}
          </Field.ErrorText>
        ) : (
          <Field.HelperText>
            …ou cole uma lista, uma linha por item: 10 Rough Plank
          </Field.HelperText>
        )}
      </Field.Root>
      {suggestions && (
        <Box mt="2" aria-live="polite">
          {suggestions.items.length || suggestions.buildings.length ? (
            <Wrap gap="1.5">
              {suggestions.buildings.map((building) => (
                <Button
                  key={`b${building.id}`}
                  size="xs"
                  variant="outline"
                  bg="bg"
                  onClick={() => pick(() => onAddBuilding(building.id))}
                >
                  {building.name}
                  <Badge size="xs">construção</Badge>
                </Button>
              ))}
              {suggestions.items.map((item) => (
                <Button
                  key={item.id}
                  size="xs"
                  variant="outline"
                  bg="bg"
                  onClick={() => pick(() => onAddItem(item.id))}
                >
                  <ItemIcon assetName={item.iconAssetName} size="4" />
                  {item.name}
                  {item.tier > 0 && (
                    <Badge size="xs" variant="outline">
                      T{item.tier}
                    </Badge>
                  )}
                  {item.itemListGameId ? (
                    <Badge size="xs" title="O craft dá este item com raridade sorteada">
                      resultado do craft
                    </Badge>
                  ) : (
                    rarityLabel(item.rarity) && <Badge size="xs">{rarityLabel(item.rarity)}</Badge>
                  )}
                  {item.kind === 'cargo' && (
                    <Text as="span" color="fg.muted">
                      cargo
                    </Text>
                  )}
                </Button>
              ))}
            </Wrap>
          ) : (
            <Text textStyle="sm" color="fg.muted">
              Nada encontrado.
            </Text>
          )}
        </Box>
      )}
    </Box>
  )
}
