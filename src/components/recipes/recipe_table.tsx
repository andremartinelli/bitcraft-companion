'use client'

import { Badge, Box, HStack, Stack, Table, Text, Wrap } from '@chakra-ui/react'
import type { ReactNode } from 'react'
import { ItemChip, StaticChip } from '@/components/items/item_chip'
import { formatNumber, formatPercent } from '@/lib/format'
import type { RecipeWithDetails } from '@/models/recipe'

export interface RecipeTableRow {
  recipe: RecipeWithDetails
  /** A line under the name: "Rende 2 por craft", "Saída aleatória: 50% de chance..." */
  note?: string | null
}

const Small = ({ children }: { children: ReactNode }) => (
  <Text as="span" textStyle="xs" color="fg.muted">
    {children}
  </Text>
)

/** What a recipe produces; random outputs show each possibility with its chance */
function Outputs({ recipe }: { recipe: RecipeWithDetails }) {
  return (
    <Stack gap="1.5">
      {recipe.kind === 'construction' && <StaticChip output>{recipe.name}</StaticChip>}
      {recipe.outputs.map((output, index) => {
        const possibilities = output.item.itemList?.possibilities ?? []
        if (possibilities.length > 1) {
          return (
            <Stack key={index} gap="1">
              {possibilities.map((possibility, p) => (
                <Stack key={p} gap="0.5">
                  <Small>{formatPercent(possibility.probability)}</Small>
                  <Wrap gap="1">
                    {possibility.items.map((entry, e) => (
                      <ItemChip
                        key={e}
                        item={entry.item}
                        quantity={entry.quantity * output.quantity}
                        output
                      />
                    ))}
                  </Wrap>
                </Stack>
              ))}
            </Stack>
          )
        }
        if (possibilities.length === 1) {
          return (
            <Wrap key={index} gap="1">
              {possibilities[0].items.map((entry, e) => (
                <ItemChip
                  key={e}
                  item={entry.item}
                  quantity={entry.quantity * output.quantity}
                  output
                />
              ))}
            </Wrap>
          )
        }
        return (
          <Wrap key={index} gap="1">
            <ItemChip item={output.item} quantity={output.quantity} output />
          </Wrap>
        )
      })}
    </Stack>
  )
}

function Row({ recipe, note }: RecipeTableRow) {
  return (
    <Table.Row verticalAlign="top">
      <Table.Cell minW="56">
        <Text fontWeight="semibold">{recipe.name}</Text>
        <HStack gap="1" mt="0.5">
          <Small>{recipe.verb}</Small>
          {recipe.isPassive && (
            <Badge size="xs" title="Roda sozinho na estação">
              passiva
            </Badge>
          )}
          {recipe.hiddenWithoutKnowledge && (
            <Badge size="xs" title="Só aparece no jogo depois do conhecimento necessário">
              oculta
            </Badge>
          )}
        </HStack>
        {note && (
          <Text textStyle="xs" color="fg.muted" mt="1">
            {note}
          </Text>
        )}
      </Table.Cell>
      <Table.Cell minW="56">
        <Outputs recipe={recipe} />
      </Table.Cell>
      <Table.Cell minW="56">
        <Wrap gap="1">
          {recipe.inputs.length ? (
            recipe.inputs.map((input, index) => (
              <ItemChip key={index} item={input.item} quantity={input.quantity} />
            ))
          ) : (
            <Small>—</Small>
          )}
        </Wrap>
        {recipe.shards > 0 && (
          <Text textStyle="xs" color="fg.muted" mt="1">
            + {formatNumber(recipe.shards)} shards
          </Text>
        )}
      </Table.Cell>
      <Table.Cell whiteSpace="nowrap">
        {recipe.skill ? (
          <>
            {recipe.skill.name} <Small>Nv {recipe.skillLevel}</Small>
          </>
        ) : (
          '—'
        )}
      </Table.Cell>
      <Table.Cell whiteSpace="nowrap">
        {recipe.toolType ? (
          <>
            {recipe.toolType.name} <Small>T{recipe.toolTier}</Small>
          </>
        ) : (
          'Mãos'
        )}
      </Table.Cell>
      <Table.Cell whiteSpace="nowrap">
        {recipe.buildingType ? (
          <>
            {recipe.buildingType.name} <Small>T{recipe.buildingTier}</Small>
          </>
        ) : recipe.pavingTier ? (
          <Small>Pavimento T{recipe.pavingTier}</Small>
        ) : (
          '—'
        )}
      </Table.Cell>
      <Table.Cell textAlign="end">{formatNumber(recipe.actionsRequired)}</Table.Cell>
      <Table.Cell textAlign="end">{formatNumber(recipe.timePerAction)}</Table.Cell>
      <Table.Cell textAlign="end">{formatNumber(recipe.staminaPerAction)}</Table.Cell>
    </Table.Row>
  )
}

/** Recipes as a table: what each one makes and takes, and what it requires */
export function RecipeTable({ rows }: { rows: RecipeTableRow[] }) {
  return (
    <Box borderWidth="1px" rounded="l2" bg="bg" overflow="hidden">
      <Table.ScrollArea>
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row bg="bg.muted">
              <Table.ColumnHeader>Receita</Table.ColumnHeader>
              <Table.ColumnHeader>Produz</Table.ColumnHeader>
              <Table.ColumnHeader>Ingredientes</Table.ColumnHeader>
              <Table.ColumnHeader>Skill</Table.ColumnHeader>
              <Table.ColumnHeader>Ferramenta</Table.ColumnHeader>
              <Table.ColumnHeader>Estação</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end" title="Número de ações (actions_required)">
                Esforço
              </Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end" title="Segundos por ação">
                s/ação
              </Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end" title="Estamina por ação">
                Estam.
              </Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Row key={row.recipe.id} {...row} />
            ))}
          </Table.Body>
        </Table.Root>
      </Table.ScrollArea>
    </Box>
  )
}
