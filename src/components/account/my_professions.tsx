'use client'

import { Checkbox, Heading, Stack, Text, Wrap } from '@chakra-ui/react'
import { useOptimistic, useTransition } from 'react'
import { updateOtherSteps, updateProfession } from '@/app/(app)/account/actions'
import { OtherStepsSelect } from '@/components/calculator/other_steps_select'
import type { OtherStepsMode } from '@/services/calculator/steps_view'

function ProfessionCheckbox({ id, name, checked }: { id: number; name: string; checked: boolean }) {
  const [, startTransition] = useTransition()
  const [shown, setShown] = useOptimistic(checked)
  return (
    <Checkbox.Root
      size="sm"
      checked={shown}
      onCheckedChange={({ checked }) =>
        startTransition(async () => {
          setShown(checked === true)
          await updateProfession({ skillId: id, on: checked === true })
        })
      }
    >
      <Checkbox.HiddenInput />
      <Checkbox.Control />
      <Checkbox.Label>{name}</Checkbox.Label>
    </Checkbox.Root>
  )
}

/**
 * "Minhas profissões": the Steps put them first and show, collapse or hide
 * the steps of the others (the default; each plan can change it for you)
 */
export function MyProfessions({
  professions,
  otherSteps,
}: {
  professions: { id: number; name: string; mine: boolean }[]
  otherSteps: OtherStepsMode
}) {
  return (
    <Stack gap="3" borderWidth="1px" rounded="l2" bg="bg" p="4" mb="6">
      <Heading as="h2" size="md">
        Minhas profissões
      </Heading>
      <Text textStyle="sm" color="fg.muted">
        Nas Etapas dos planos e da calculadora, as suas profissões vêm primeiro. Etapas de
        &quot;Qualquer profissão&quot; e do que não tem receita aparecem sempre. Sem nenhuma
        marcada, nada é escondido.
      </Text>
      <Wrap gap="4">
        {professions.map((profession) => (
          <ProfessionCheckbox
            key={profession.id}
            id={profession.id}
            name={profession.name}
            checked={profession.mine}
          />
        ))}
      </Wrap>
      <OtherStepsSelect
        value={otherSteps}
        save={updateOtherSteps}
        label="Etapas de outras profissões (padrão; cada plano pode mudar só para você)"
      />
    </Stack>
  )
}
