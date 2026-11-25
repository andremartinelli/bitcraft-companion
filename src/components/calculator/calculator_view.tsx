'use client'

import {
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Flex,
  HStack,
  Spinner,
  Table,
  Text,
} from '@chakra-ui/react'
import type { ReactNode } from 'react'
import { updateRecipeChoice } from '@/app/(app)/recipe_choices/actions'
import { CalculatorResult } from '@/components/calculator/calculator_result'
import { ItemPicker } from '@/components/calculator/item_picker'
import { addItemList } from '@/services/calculator/item_list'
import { ItemChip, StaticChip } from '@/components/items/item_chip'
import { CommitInput } from '@/components/ui/commit_input'
import { formatAgo } from '@/lib/format'
import type { CalculatorState } from '@/services/calculator/production_planner'
import type { CalculatorPanel } from '@/services/calculator/presenter'
import {
  addBuilding,
  addTarget,
  removeBuilding,
  removeTarget,
  setBuildingQuantity,
  setChoice,
  setOwned,
  setTargetQuantity,
} from '@/services/calculator/state_params'

export interface CalculatorViewProps {
  state: CalculatorState
  panel: CalculatorPanel
  errors: string[]
  /** "/calculator" or "/plans/3": where the open rounds are remembered */
  storageKey: string
  /** A new state to calculate (and, in a plan, to save) */
  onChange: (state: CalculatorState) => void
  /** The new calculation is on its way */
  pending: boolean
  /** What the spinner says meanwhile: "Calculando…" or, in a plan, "Salvando…" */
  pendingLabel?: string
  /** Under the item list: "Salvar como plano" in the quick calculator */
  actions?: ReactNode
  /** "Sincronizar agora", which also reads BitJita when the inventory is old; in a plan, "Usar apenas meu inventário"; without a character, the warning to choose one */
  inventoryControls?: ReactNode
  /** Next to the search: "Planos rápidos" in a plan */
  pickerActions?: ReactNode
}

/** A quantity from a field; a blank one changes nothing */
const quantityOf = (value: string) => (value.trim() === '' ? null : Number(value))

/**
 * The calculator: what to make (items and buildings), the inventory's state
 * and the result. The same panel serves the quick calculator (state in the
 * URL) and the plans (state saved on every change).
 */
export function CalculatorView({
  state,
  panel,
  errors,
  storageKey,
  onChange,
  pending,
  pendingLabel = 'Calculando…',
  actions,
  inventoryControls,
  pickerActions,
}: CalculatorViewProps) {
  const change = (next: CalculatorState) => {
    if (next !== state) onChange(next)
  }
  // "Já tenho" = 1 on the previous tier: the one they keep equipped
  const markPrevious = (s: CalculatorState, itemId: number, checked: boolean) =>
    setOwned(s, itemId, checked ? '1' : '')
  const previousTiers = panel.targets.flatMap((t) => (t.previousTier ? [t.previousTier] : []))
  const ownedPrevious = previousTiers.filter((p) => p.owned).length
  const allPrevious =
    ownedPrevious === 0 ? false : ownedPrevious === previousTiers.length ? true : 'indeterminate'

  return (
    <Box>
      <ItemPicker
        onAddItem={(itemId) => change(addTarget(state, itemId))}
        onAddBuilding={(recipeId) => change(addBuilding(state, recipeId))}
        onAddList={(list) => {
          const added = addItemList(state, list)
          if (!added.errors.length) change(added.state)
          return added.errors
        }}
        actions={pickerActions}
      />

      {errors.length > 0 && (
        <Alert.Root status="error" mb="4">
          <Alert.Indicator />
          <Alert.Content>
            {errors.map((message) => (
              <Alert.Description key={message}>{message}</Alert.Description>
            ))}
          </Alert.Content>
        </Alert.Root>
      )}

      {!panel.empty && (
        <Box borderWidth="1px" rounded="l2" bg="bg" mb="4" maxH="80" overflowY="auto">
          <Table.Root size="sm" stickyHeader>
            <Table.Header>
              <Table.Row bg="bg.muted">
                <Table.ColumnHeader>Item</Table.ColumnHeader>
                {previousTiers.length > 0 && (
                  <Table.ColumnHeader>
                    <Checkbox.Root
                      size="sm"
                      checked={allPrevious}
                      onCheckedChange={({ checked }) =>
                        change(
                          previousTiers.reduce(
                            (s, p) => markPrevious(s, p.item.id, checked === true),
                            state
                          )
                        )
                      }
                    >
                      <Checkbox.HiddenInput />
                      <Checkbox.Control />
                      <Checkbox.Label>Tier anterior</Checkbox.Label>
                    </Checkbox.Root>
                  </Table.ColumnHeader>
                )}
                <Table.ColumnHeader textAlign="end">Quantidade</Table.ColumnHeader>
                <Table.ColumnHeader />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {panel.targets.map((target) => (
                <Table.Row key={`t${target.item.id}`}>
                  <Table.Cell>
                    <HStack gap="2">
                      <ItemChip item={target.item} />
                      {target.item.removed && <Badge colorPalette="red">saiu do jogo</Badge>}
                    </HStack>
                  </Table.Cell>
                  {previousTiers.length > 0 && (
                    <Table.Cell>
                      {target.previousTier && (
                        <Checkbox.Root
                          size="sm"
                          checked={target.previousTier.owned}
                          onCheckedChange={({ checked }) =>
                            change(
                              markPrevious(state, target.previousTier!.item.id, checked === true)
                            )
                          }
                        >
                          <Checkbox.HiddenInput />
                          <Checkbox.Control />
                          <Checkbox.Label fontWeight="normal">
                            {target.previousTier.item.name}
                          </Checkbox.Label>
                        </Checkbox.Root>
                      )}
                    </Table.Cell>
                  )}
                  <Table.Cell textAlign="end">
                    <CommitInput
                      key={`${target.item.id}:${target.quantity}`}
                      size="xs"
                      width="28"
                      min={1}
                      max={100_000}
                      value={String(target.quantity)}
                      aria-label={`Quantidade de ${target.item.name}`}
                      onCommit={(value) => {
                        const quantity = quantityOf(value)
                        if (quantity !== null)
                          change(setTargetQuantity(state, target.index, quantity))
                      }}
                    />
                  </Table.Cell>
                  <Table.Cell textAlign="end">
                    <Button
                      size="xs"
                      variant="ghost"
                      aria-label={`Remover ${target.item.name}`}
                      onClick={() => change(removeTarget(state, target.index))}
                    >
                      Remover
                    </Button>
                  </Table.Cell>
                </Table.Row>
              ))}
              {panel.buildings.map((building) => (
                <Table.Row key={`b${building.recipe.id}`}>
                  <Table.Cell>
                    <HStack gap="2">
                      <StaticChip>{building.recipe.name}</StaticChip>
                      <Badge size="sm">construção</Badge>
                      {building.removed && <Badge colorPalette="red">saiu do jogo</Badge>}
                    </HStack>
                  </Table.Cell>
                  {previousTiers.length > 0 && <Table.Cell />}
                  <Table.Cell textAlign="end">
                    <CommitInput
                      key={`${building.recipe.id}:${building.quantity}`}
                      size="xs"
                      width="28"
                      min={1}
                      max={1_000}
                      value={String(building.quantity)}
                      aria-label={`Quantidade de ${building.recipe.name}`}
                      onCommit={(value) => {
                        const quantity = quantityOf(value)
                        if (quantity !== null) {
                          change(setBuildingQuantity(state, building.index, quantity))
                        }
                      }}
                    />
                  </Table.Cell>
                  <Table.Cell textAlign="end">
                    <Button
                      size="xs"
                      variant="ghost"
                      aria-label={`Remover ${building.recipe.name}`}
                      onClick={() => change(removeBuilding(state, building.index))}
                    >
                      Remover
                    </Button>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      )}

      <Flex gap="3" align="center" wrap="wrap" mb="4" minH="8">
        {panel.inventory.available && (
          <Text textStyle="sm" color="fg.muted">
            Inventário sincronizado{' '}
            {formatAgo(panel.inventory.syncedAt ? new Date(panel.inventory.syncedAt) : null)} · o
            &quot;já tenho&quot; digitado tem prioridade
          </Text>
        )}
        {inventoryControls}
        {actions}
        {pending && (
          <HStack gap="1.5" color="fg.muted" ml="auto">
            <Spinner size="xs" />
            <Text textStyle="sm">{pendingLabel}</Text>
          </HStack>
        )}
      </Flex>

      <CalculatorResult
        panel={panel}
        storageKey={storageKey}
        onChoice={(itemId, value) => {
          change(setChoice(state, itemId, value))
          // A recipe (not "Automático" or raw material) becomes the account's default
          if (/^\d+$/.test(value)) void updateRecipeChoice({ itemId, recipeId: Number(value) })
        }}
        onOwned={(itemId, value) => change(setOwned(state, itemId, value))}
      />
    </Box>
  )
}
