'use client'

import {
  Alert,
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  NativeSelect,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { LuCircleCheck } from 'react-icons/lu'
import { RecipePicker } from '@/components/calculator/recipe_picker'
import { ItemChip, StaticChip } from '@/components/items/item_chip'
import { EmptyNotice } from '@/components/layout/empty_notice'
import { CommitInput } from '@/components/ui/commit_input'
import { DetailsSummary as Summary, RememberedDetails } from '@/components/ui/remembered_details'
import { formatNumber } from '@/lib/format'
import type { CalculatorPanel, PresentedNode } from '@/services/calculator/presenter'

type Round = CalculatorPanel['rounds'][number]
type Step = Round['steps'][number]
type Material = CalculatorPanel['materials'][number]
type Build = NonNullable<CalculatorPanel['buildRound']>['entries'][number]

interface ResultProps {
  panel: CalculatorPanel
  /** Where the open rounds are remembered: "/calculator", "/plans/3" */
  storageKey: string
  onChoice: (itemId: number, value: string) => void
  onOwned: (itemId: number, value: string) => void
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <Text textStyle="sm" color="fg.muted">
      {children}
    </Text>
  )
}

/** One line of a round: the quantity on the left, then the item and what to know about it */
function Row({
  qty,
  done,
  ready,
  children,
}: {
  qty: string
  done?: boolean
  ready?: boolean
  children: ReactNode
}) {
  return (
    <Flex
      as="li"
      data-done={done ? '' : undefined}
      gap="3"
      py="1.5"
      borderTopWidth="1px"
      align="baseline"
      color={done ? 'fg.muted' : undefined}
      textDecoration={done ? 'line-through' : undefined}
      bg={ready ? 'green.subtle' : undefined}
      px="2"
      rounded={ready ? 'sm' : undefined}
    >
      <Text
        flexShrink="0"
        width="24"
        textAlign="end"
        fontWeight="semibold"
        fontVariantNumeric="tabular-nums"
      >
        {qty}
      </Text>
      <Flex gap="2" wrap="wrap" align="center" textStyle="sm">
        {children}
      </Flex>
    </Flex>
  )
}

function Ready({ children }: { children: ReactNode }) {
  return (
    <HStack as="span" gap="1" color="green.fg" fontWeight="medium" textDecoration="none">
      <LuCircleCheck aria-hidden />
      {children}
    </HStack>
  )
}

const Muted = ({ children, title }: { children: ReactNode; title?: string }) => (
  <Text as="span" color="fg.muted" title={title}>
    {children}
  </Text>
)

/** Where a step is done: station (or tool) and level; the recipe's name in the tooltip */
function StepWhere({ step }: { step: Step }) {
  const recipe = step.recipe
  return (
    <>
      {step.flowLabel && <Muted>{step.flowLabel}</Muted>}
      {recipe && (
        <Muted title={recipe.name}>
          {recipe.stationName
            ? `${recipe.stationName} T${recipe.stationTier}`
            : recipe.toolName
              ? `${recipe.toolName} T${recipe.toolTier}`
              : 'sem estação'}
          {recipe.skillLevel ? ` · Nv ${recipe.skillLevel}` : ''}
        </Muted>
      )}
    </>
  )
}

function MaterialRow({ row }: { row: Material }) {
  return (
    <Row qty={row.qtyLabel} done={row.complete}>
      <ItemChip item={row.item} />
      {row.holdersLabel && <Muted>{row.holdersLabel}</Muted>}
      {!row.complete ? (
        <Text as="span" color="orange.fg">
          faltam {row.approximate ? '≈ ' : ''}
          {formatNumber(row.missing)}
          {row.coveredLabel ? ` · ${row.coveredLabel}` : ''}
        </Text>
      ) : (
        row.coveredLabel && <Muted>{row.coveredLabel}</Muted>
      )}
    </Row>
  )
}

function StepRow({ step, onChoice }: { step: Step; onChoice: ResultProps['onChoice'] }) {
  const approx = step.approximate ? '≈ ' : ''
  return (
    <Row
      qty={
        step.done
          ? `${approx}${formatNumber(step.quantity)} / ${formatNumber(step.quantity)}`
          : `${approx}${formatNumber(step.wholeCrafts)}×`
      }
      done={step.done}
      ready={step.ready}
    >
      <ItemChip item={step.item} />
      {step.recipes.length > 0 && <RecipePicker step={step} onChoice={onChoice} />}
      <StepWhere step={step} />
      {step.done ? (
        <Muted>{step.haveLabel}</Muted>
      ) : step.ready ? (
        <Ready>pronto para fazer</Ready>
      ) : step.wholeReadyCrafts > 0 ? (
        <Muted>
          {formatNumber(step.wholeReadyCrafts)} de {formatNumber(step.wholeCrafts)} já dá para fazer
          · espera {step.waitingLabel}
        </Muted>
      ) : (
        <Muted>espera {step.waitingLabel}</Muted>
      )}
    </Row>
  )
}

function BuildRow({ build }: { build: Build }) {
  const recipe = build.recipe
  return (
    <Row qty={`${formatNumber(build.quantity)}×`} ready={build.ready}>
      <StaticChip>{recipe.name}</StaticChip>
      {build.flowLabel && <Muted>{build.flowLabel}</Muted>}
      <Muted>
        {recipe.skillName ?? 'Construção'}
        {recipe.skillLevel ? ` Nv ${recipe.skillLevel}` : ''}
        {recipe.toolName ? ` · ${recipe.toolName} T${recipe.toolTier}` : ''}
      </Muted>
      {build.ready ? (
        <Ready>pronto para construir</Ready>
      ) : (
        <Muted>espera {build.waitingLabel}</Muted>
      )}
    </Row>
  )
}

function RoundBox({
  title,
  count,
  rememberKey,
  complete,
  children,
}: {
  title: string
  count: string
  rememberKey: string
  complete: boolean
  children: ReactNode
}) {
  return (
    <RememberedDetails
      rememberKey={rememberKey}
      complete={complete}
      borderWidth="1px"
      rounded="l2"
      bg="bg"
      px="4"
      mb="3"
    >
      <Summary>
        <Text fontWeight="semibold">{title}</Text>
        <Text textStyle="sm" color="fg.muted">
          {count}
        </Text>
      </Summary>
      <Box pb="3">{children}</Box>
    </RememberedDetails>
  )
}

function ProfessionBox({
  name,
  count,
  rememberKey,
  complete,
  children,
}: {
  name: string
  count: string
  rememberKey: string
  complete: boolean
  children: ReactNode
}) {
  return (
    <RememberedDetails rememberKey={rememberKey} complete={complete} mb="2">
      <Summary py="1">
        <Text textStyle="sm" fontWeight="semibold">
          {name}
        </Text>
        <Text textStyle="xs" color="fg.muted">
          {count}
        </Text>
      </Summary>
      <Box as="ul" listStyleType="none">
        {children}
      </Box>
    </RememberedDetails>
  )
}

function TreeNode({
  node,
  depth,
  onChoice,
  onOwned,
}: {
  node: PresentedNode
  depth: number
  onChoice: ResultProps['onChoice']
  onOwned: ResultProps['onOwned']
}) {
  const approx = node.approximate ? '≈ ' : ''
  const selected = node.options.find((option) => option.selected)?.value ?? ''
  return (
    <Box
      ml={depth ? '3' : '0'}
      pl={depth ? '3' : '0'}
      borderLeftWidth={depth ? '1px' : '0'}
      borderColor="border"
    >
      <Flex gap="2" wrap="wrap" align="center" py="1" textStyle="sm">
        <Text minW="14" textAlign="end" fontWeight="semibold" fontVariantNumeric="tabular-nums">
          {approx}
          {formatNumber(node.needed)}
        </Text>
        <ItemChip item={node.item} />
        {node.recipe ? (
          <Muted>
            {approx}
            {formatNumber(node.crafts)}× {node.recipe.name}
            {node.recipe.stationName && ` · ${node.recipe.stationName} T${node.recipe.stationTier}`}
            {node.recipe.skillName && ` · ${node.recipe.skillName} Nv ${node.recipe.skillLevel}`}
          </Muted>
        ) : (
          node.reasonLabel && (
            <Text as="span" color="fg.muted" fontStyle="italic">
              {node.reasonLabel}
            </Text>
          )
        )}
        <HStack gap="2" ml="auto" wrap="wrap" minW="0">
          {node.options.length > 1 && (
            <NativeSelect.Root size="xs" width="64" maxW="full">
              <NativeSelect.Field
                aria-label={`Receita para ${node.item.name}`}
                value={selected}
                onChange={(event) => onChoice(node.item.id, event.currentTarget.value)}
                bg="bg"
              >
                {node.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          )}
          <HStack as="label" gap="1.5" color="fg.muted" textStyle="xs">
            já tenho
            <CommitInput
              key={`${node.item.id}:${node.owned ?? ''}`}
              size="xs"
              width="24"
              bg="bg"
              min={0}
              value={node.owned === null ? '' : String(node.owned)}
              placeholder={String(node.inventoryQuantity ?? 0)}
              title={
                node.inventoryQuantity === null
                  ? undefined
                  : `${formatNumber(node.inventoryQuantity)} no seu inventário; digite um valor para usar outro`
              }
              aria-label={`Quantos ${node.item.name} vocês já têm`}
              onCommit={(value) => onOwned(node.item.id, value)}
            />
          </HStack>
        </HStack>
      </Flex>
      {node.fromOwned > 0 && (
        <Text textStyle="xs" color="fg.muted" ml="16" mb="1">
          usando {formatNumber(node.fromOwned)}{' '}
          {node.ownedSource === 'inventory' ? 'do inventário' : 'que vocês informaram'} · faltam{' '}
          {approx}
          {formatNumber(node.missing)}
        </Text>
      )}
      {node.children.map((child, index) => (
        <TreeNode
          key={index}
          node={child}
          depth={depth + 1}
          onChoice={onChoice}
          onOwned={onOwned}
        />
      ))}
    </Box>
  )
}

const noSubscribe = () => () => {}

/**
 * "Esconder concluídos", remembered by this browser for each calculation
 * (each plan, the calculator). The server draws it off and the browser's
 * choice follows when the page hydrates. With storage blocked it still
 * toggles, without memory.
 */
function useHideDone(storageKey: string) {
  const key = `hide-done:${storageKey}`
  const stored = useSyncExternalStore(
    noSubscribe,
    () => {
      try {
        return localStorage.getItem(key) === '1'
      } catch {
        return false
      }
    },
    () => false
  )
  // What was clicked here, for this calculation only (another plan reuses the component)
  const [chosen, setChosen] = useState<{ key: string; hide: boolean } | null>(null)
  const hide = chosen?.key === key ? chosen.hide : stored
  const toggle = () => {
    setChosen({ key, hide: !hide })
    try {
      localStorage.setItem(key, hide ? '0' : '1')
    } catch {
      // Storage blocked: nothing to remember with
    }
  }
  return [hide, toggle] as const
}

/**
 * The calculation: round 1 gathers the raw materials; the next ones make
 * each item once, in an order that works; buildings last. The full tree, to
 * change recipes and "já tenho", stays folded at the end.
 */
export function CalculatorResult({ panel, storageKey, onChoice, onOwned }: ResultProps) {
  const [hideDone, toggleHideDone] = useHideDone(storageKey)

  if (panel.empty) {
    return (
      <EmptyNotice>
        Adicione itens ou construções (um Loom, um Kiln...) para ver a matéria-prima e as etapas até
        o fim da cadeia. Em cada etapa dá para trocar a receita ou marcar o que vocês já têm.
      </EmptyNotice>
    )
  }

  return (
    <Stack gap="4">
      {panel.warnings.length > 0 && (
        <Alert.Root status="warning">
          <Alert.Indicator />
          <Alert.Content>
            {panel.warnings.map((warning) => (
              <Alert.Description key={warning}>{warning}</Alert.Description>
            ))}
          </Alert.Content>
        </Alert.Root>
      )}

      <Box
        as="section"
        aria-labelledby="calc-steps"
        data-hide-done={hideDone ? '' : undefined}
        // Done lines, and rounds or professions with nothing left
        css={{ '&[data-hide-done] :is([data-done], details[data-complete])': { display: 'none' } }}
      >
        <Flex align="center" justify="space-between" gap="3" mb="1">
          <Heading id="calc-steps" size="lg">
            Etapas
          </Heading>
          {panel.doneCount > 0 && (
            <Button size="xs" variant="ghost" onClick={toggleHideDone} aria-pressed={hideDone}>
              {hideDone ? 'Mostrar' : 'Esconder'} concluídos ({panel.doneCount})
            </Button>
          )}
        </Flex>
        <Box mb="3">
          <Hint>
            Primeiro, coletar a matéria-prima. Depois, cada item uma vez, somando a árvore inteira:
            uma rodada só depende das anteriores e, dentro dela, vai por estação.{' '}
            <strong>Riscado é o que vocês já têm:</strong> não precisa fazer nem coletar o que vai
            nele.
          </Hint>
        </Box>

        <RoundBox
          title="Rodada 1 · Coletar"
          count={
            panel.materials.length
              ? `${panel.materialsDone} de ${panel.materials.length} completas`
              : 'nada a coletar'
          }
          rememberKey={`${storageKey}:round:1`}
          complete={panel.gatherComplete}
        >
          {panel.materialGroups.map((group) => (
            <ProfessionBox
              key={group.key}
              name={group.name}
              count={`${group.entries.length} ${group.entries.length === 1 ? 'item' : 'itens'}${
                group.doneCount
                  ? ` · ${group.doneCount} ${group.doneCount === 1 ? 'completo' : 'completos'}`
                  : ''
              }`}
              rememberKey={`${storageKey}:round:1:${group.key}`}
              complete={group.complete}
            >
              {group.entries.map((row) => (
                <MaterialRow key={row.itemId} row={row} />
              ))}
            </ProfessionBox>
          ))}
          <Hint>
            {panel.materials.length
              ? 'À esquerda, o que vocês têm / o que o plano precisa; ao lado do item, com quem está. Riscado com "já têm em": já foi usado em algo pronto que vocês têm.'
              : 'Nada para coletar: vocês já têm tudo.'}
          </Hint>
        </RoundBox>

        {panel.rounds.map((round: Round) => (
          <RoundBox
            key={round.round}
            title={`Rodada ${round.round}`}
            count={round.countLabel}
            rememberKey={`${storageKey}:round:${round.round}`}
            complete={round.complete}
          >
            {round.professions.map((profession) => (
              <ProfessionBox
                key={profession.key}
                name={profession.name}
                count={profession.countLabel}
                rememberKey={`${storageKey}:round:${round.round}:${profession.key}`}
                complete={profession.complete}
              >
                {profession.entries.map((step) => (
                  <StepRow key={step.itemId} step={step} onChoice={onChoice} />
                ))}
              </ProfessionBox>
            ))}
          </RoundBox>
        ))}
        {!panel.rounds.length && !panel.buildRound && (
          <Hint>Nada para fabricar: vocês já têm tudo.</Hint>
        )}

        {panel.buildRound && (
          <RoundBox
            title={`Rodada ${panel.buildRound.round} · Construir`}
            count={`${panel.buildRound.entries.length} ${panel.buildRound.entries.length === 1 ? 'construção' : 'construções'}`}
            rememberKey={`${storageKey}:round:build`}
            complete={false}
          >
            <Box as="ul" listStyleType="none">
              {panel.buildRound.entries.map((build) => (
                <BuildRow key={build.recipeId} build={build} />
              ))}
            </Box>
          </RoundBox>
        )}
      </Box>

      <RememberedDetails
        rememberKey="calc:tree"
        defaultOpen={false}
        borderWidth="1px"
        rounded="l2"
        bg="bg"
        px="4"
      >
        <Summary>
          <Heading as="h2" size="lg">
            Árvore de produção
          </Heading>
          <Text textStyle="sm" color="fg.muted">
            trocar receitas e corrigir o &quot;já tenho&quot;
          </Text>
        </Summary>
        <Stack gap="2" pb="4">
          <Hint>
            Troque a receita de cada etapa ou informe quanto vocês já têm. &quot;≈&quot; marca
            valores médios de saídas aleatórias.
          </Hint>
          {panel.buildTrees.map((build) => (
            <Box key={build.recipe.id}>
              <Flex gap="2" align="center" py="1" textStyle="sm">
                <Text minW="14" textAlign="end" fontWeight="semibold">
                  {formatNumber(build.quantity)}
                </Text>
                <StaticChip>{build.recipe.name}</StaticChip>
                <Muted>
                  construção
                  {build.recipe.skillName
                    ? ` · ${build.recipe.skillName} Nv ${build.recipe.skillLevel}`
                    : ''}
                </Muted>
              </Flex>
              {build.children.map((child, index) => (
                <TreeNode
                  key={index}
                  node={child}
                  depth={1}
                  onChoice={onChoice}
                  onOwned={onOwned}
                />
              ))}
            </Box>
          ))}
          {panel.trees.map((node, index) => (
            <TreeNode key={index} node={node} depth={0} onChoice={onChoice} onOwned={onOwned} />
          ))}
        </Stack>
      </RememberedDetails>
    </Stack>
  )
}
