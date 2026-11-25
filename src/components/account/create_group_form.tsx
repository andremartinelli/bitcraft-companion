'use client'

import { Box, Button, Field, HStack, Input } from '@chakra-ui/react'
import { useActionState } from 'react'
import { createGroup, type GroupFormState } from '@/app/(app)/account/actions'

const INITIAL: GroupFormState = { error: null, value: '' }

/** "Criar grupo": the account becomes its owner and invites people by e-mail */
export function CreateGroupForm() {
  const [state, action, pending] = useActionState(createGroup, INITIAL)
  return (
    <Box p="4" borderWidth="1px" rounded="l2" bg="bg">
      <form action={action}>
        <Field.Root invalid={state.error !== null}>
          <Field.Label>Criar grupo</Field.Label>
          <HStack gap="2" width="full" maxW="lg">
            <Input
              name="name"
              size="sm"
              required
              maxLength={60}
              autoComplete="off"
              placeholder="Nome do grupo, ex.: Clã do Norte"
              defaultValue={state.value}
            />
            <Button type="submit" size="sm" loading={pending}>
              Criar grupo
            </Button>
          </HStack>
          {state.error ? (
            <Field.ErrorText>{state.error}</Field.ErrorText>
          ) : (
            <Field.HelperText>Depois, convide as pessoas pelo e-mail.</Field.HelperText>
          )}
        </Field.Root>
      </form>
    </Box>
  )
}
