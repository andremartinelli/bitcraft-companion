'use client'

import { Alert, Button, Flex, Menu, Portal, Stack, Text } from '@chakra-ui/react'
import { useState, useTransition, type ReactNode } from 'react'
import { LuChevronDown, LuChevronRight } from 'react-icons/lu'
import { addQuickPlan, createQuickPlan } from '@/app/(app)/plans/actions'
import type { MetalStyle, QuickPlanEntry } from '@/services/plans/quick_plans'

/** An entry that opens a submenu to its right */
function Submenu({
  label,
  title,
  children,
}: {
  label: string
  title?: string
  children: ReactNode
}) {
  return (
    <Menu.Root positioning={{ placement: 'right-start', gutter: 2 }}>
      <Menu.TriggerItem title={title}>
        <Text flex="1">{label}</Text>
        <LuChevronRight />
      </Menu.TriggerItem>
      <Portal>
        <Menu.Positioner>
          <Menu.Content>{children}</Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  )
}

/**
 * "Planos rápidos": Planos rápidos › set › (style ›) tier. Choosing a tier
 * creates the plan and opens it or, in a plan (planId), adds the items to it.
 * Chakra's menu does the keyboard (arrows, Enter, Escape) and the hover.
 */
export function QuickPlanMenu({ catalog, planId }: { catalog: QuickPlanEntry[]; planId?: number }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const create = (template: QuickPlanEntry['key'], tier: number, style?: MetalStyle) =>
    startTransition(async () => {
      setError(null)
      const input = { template, tier, style }
      const result = await (planId ? addQuickPlan(planId, input) : createQuickPlan(input))
      // Creating opens the new plan and there is nothing to read
      if (result?.error) setError(result.error)
    })

  const tiers = (entry: QuickPlanEntry, style?: MetalStyle) =>
    entry.tiers.map((option) => (
      <Menu.Item
        key={option.tier}
        value={`${entry.key}:${style ?? ''}:${option.tier}`}
        onSelect={() => create(entry.key, option.tier, style)}
      >
        <Text flex="1">
          T{option.tier} · {option.material}
        </Text>
        <Menu.ItemCommand>
          {option.count === 1 ? '1 item' : `${option.count} itens`}
        </Menu.ItemCommand>
      </Menu.Item>
    ))

  return (
    <Stack gap="2" mb={planId ? undefined : '4'}>
      <Flex gap="3" align="center" wrap="wrap">
        <Menu.Root>
          <Menu.Trigger asChild>
            <Button
              size={planId ? 'md' : 'sm'}
              variant="outline"
              loading={pending}
              loadingText={planId ? 'Adicionando…' : 'Criando…'}
              title={
                planId
                  ? 'Adiciona a este plano um set, as ferramentas ou o upgrade do assentamento de um tier'
                  : undefined
              }
            >
              Planos rápidos <LuChevronDown />
            </Button>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content minW="56">
                {catalog.map((entry) => (
                  <Submenu key={entry.key} label={entry.label} title={entry.description}>
                    {entry.styles
                      ? entry.styles.map((style) => (
                          <Submenu key={style} label={style}>
                            {tiers(entry, style)}
                          </Submenu>
                        ))
                      : tiers(entry)}
                  </Submenu>
                ))}
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
        {!planId && (
          <Text textStyle="sm" color="fg.muted">
            um set, as ferramentas ou o upgrade do assentamento de um tier, num plano novo
          </Text>
        )}
      </Flex>
      {error && (
        <Alert.Root status="error" size="sm">
          <Alert.Indicator />
          <Alert.Title>{error}</Alert.Title>
        </Alert.Root>
      )}
    </Stack>
  )
}
