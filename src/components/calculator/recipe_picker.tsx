'use client'

import { Badge, Box, Button, Flex, Menu, Portal, Text } from '@chakra-ui/react'
import { LuArrowLeftRight, LuChevronDown } from 'react-icons/lu'
import type { CalculatorPanel } from '@/services/calculator/presenter'

type Step = CalculatorPanel['rounds'][number]['steps'][number]

/**
 * "Trocar receita (2)" in a step: every recipe that makes the item, with
 * what goes in, how many come out and where. Picking one recalculates the
 * steps and becomes the account's default. Chakra's menu does the keyboard
 * (arrows, Enter, Escape).
 */
export function RecipePicker({
  step,
  onChoice,
}: {
  step: Step
  onChoice: (itemId: number, value: string) => void
}) {
  const inUse = step.recipes.find((recipe) => recipe.inUse)
  return (
    <Menu.Root positioning={{ placement: 'bottom-start' }}>
      <Menu.Trigger asChild>
        <Button size="2xs" variant="ghost" color="fg.muted" textDecoration="none">
          <LuArrowLeftRight aria-hidden />
          Trocar receita ({step.recipes.length})
          <LuChevronDown aria-hidden />
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content maxW="sm">
            <Box px="2" pt="1" pb="2">
              <Text fontWeight="semibold">Escolher receita</Text>
              <Text textStyle="xs" color="fg.muted">
                Como fazer {step.item.name}: as etapas e a matéria-prima mudam junto. A escolha vira
                o seu padrão para os próximos planos.
              </Text>
            </Box>
            <Menu.Separator />
            <Menu.RadioItemGroup
              value={inUse ? String(inUse.id) : ''}
              onValueChange={({ value }) => {
                if (value !== String(inUse?.id)) onChoice(step.itemId, value)
              }}
            >
              {step.recipes.map((recipe) => (
                <Menu.RadioItem key={recipe.id} value={String(recipe.id)} title={recipe.name}>
                  <Box flex="1" py="1">
                    <Flex gap="2" align="center" justify="space-between">
                      <Text fontWeight="medium">
                        {recipe.inputsLabel} · {recipe.yieldLabel}
                      </Text>
                      <Flex gap="1" flexShrink="0">
                        {recipe.isDefault && <Badge variant="outline">Padrão</Badge>}
                        {recipe.inUse && <Badge colorPalette="green">Em uso</Badge>}
                      </Flex>
                    </Flex>
                    <Text textStyle="xs" color="fg.muted">
                      {recipe.whereLabel}
                    </Text>
                  </Box>
                </Menu.RadioItem>
              ))}
            </Menu.RadioItemGroup>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  )
}
