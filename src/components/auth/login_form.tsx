'use client'

import {
  Alert,
  Button,
  Card,
  Center,
  Code,
  Field,
  Heading,
  Input,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useActionState } from 'react'
import { createSession, type LoginState } from '@/app/login/actions'

const INITIAL: LoginState = { error: null, email: '' }

/** E-mail and password. `next`: the page to go back to */
export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(createSession, INITIAL)

  return (
    <Center minH="100dvh" bg="bg.subtle" p="4">
      <Card.Root width="full" maxW="sm">
        <Card.Header>
          <Heading size="xl">BitCraft Companion</Heading>
          <Text color="fg.muted">Entre com a conta de vocês.</Text>
        </Card.Header>
        <Card.Body>
          <form action={action}>
            <Stack gap="4">
              {state.error && (
                <Alert.Root status="error" size="sm">
                  <Alert.Indicator />
                  <Alert.Title>{state.error}</Alert.Title>
                </Alert.Root>
              )}
              <Field.Root required>
                <Field.Label>E-mail</Field.Label>
                <Input
                  name="email"
                  type="email"
                  autoComplete="username"
                  defaultValue={state.email}
                  autoFocus
                />
              </Field.Root>
              <Field.Root required>
                <Field.Label>Senha</Field.Label>
                <Input name="password" type="password" autoComplete="current-password" />
              </Field.Root>
              <input type="hidden" name="next" value={next} />
              <Button type="submit" loading={pending} loadingText="Entrando…">
                Entrar
              </Button>
            </Stack>
          </form>
        </Card.Body>
        <Card.Footer>
          <Text textStyle="xs" color="fg.muted">
            Não há cadastro pelo site: as contas são criadas com{' '}
            <Code size="sm">npm run users:create</Code>.
          </Text>
        </Card.Footer>
      </Card.Root>
    </Center>
  )
}
