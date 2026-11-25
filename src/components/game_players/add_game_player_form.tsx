'use client'

import { Button, Field, HStack, Input, Text } from '@chakra-ui/react'
import { useActionState } from 'react'
import { createGamePlayer, type GamePlayerFormState } from '@/app/(app)/game_player/actions'

const INITIAL: GamePlayerFormState = { error: null, notice: null, username: '' }

/** The account's character by nick: checked on BitJita before it is saved */
export function AddGamePlayerForm() {
  const [state, action, pending] = useActionState(createGamePlayer, INITIAL)
  return (
    <form action={action}>
      <Field.Root invalid={state.error !== null} mb="5" maxW="lg">
        <Field.Label>Nick do seu personagem</Field.Label>
        <HStack gap="2" width="full">
          <Input
            name="username"
            size="sm"
            bg="bg"
            maxLength={40}
            required
            autoComplete="off"
            placeholder="Nick exato no jogo"
            defaultValue={state.username}
          />
          <Button type="submit" size="sm" loading={pending} loadingText="Procurando…">
            Salvar
          </Button>
        </HStack>
        {state.error && <Field.ErrorText>{state.error}</Field.ErrorText>}
        {state.notice && (
          <Text textStyle="sm" color="fg.success" role="status">
            {state.notice}
          </Text>
        )}
      </Field.Root>
    </form>
  )
}
