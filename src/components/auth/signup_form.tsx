'use client'

import {
  Alert,
  Button,
  Card,
  Center,
  Field,
  Heading,
  Input,
  Link,
  Stack,
  Text,
} from '@chakra-ui/react'
import NextLink from 'next/link'
import { useActionState } from 'react'
import { createAccount, type SignupState } from '@/app/signup/actions'
import { PASSWORD_MIN } from '@/validators/user'

const INITIAL: SignupState = { error: null, fullName: '', email: '', gamePlayerUsername: '' }

/** Name, e-mail, the password twice and, optionally, the character's nick. `next`: the page to go to afterwards */
export function SignupForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(createAccount, INITIAL)

  return (
    <Center minH="100dvh" bg="bg.subtle" p="4">
      <Card.Root width="full" maxW="sm">
        <Card.Header>
          <Heading size="xl">Criar conta</Heading>
          <Text color="fg.muted">
            Cada conta tem os seus planos e o seu personagem, cujo inventário entra nos cálculos.
          </Text>
        </Card.Header>
        <Card.Body>
          <form action={action}>
            <input type="hidden" name="next" value={next} />
            <Stack gap="4">
              {state.error && (
                <Alert.Root status="error" size="sm">
                  <Alert.Indicator />
                  <Alert.Title>{state.error}</Alert.Title>
                </Alert.Root>
              )}
              <Field.Root required>
                <Field.Label>Nome</Field.Label>
                <Input
                  name="fullName"
                  autoComplete="name"
                  maxLength={100}
                  defaultValue={state.fullName}
                  autoFocus
                />
              </Field.Root>
              <Field.Root required>
                <Field.Label>E-mail</Field.Label>
                <Input name="email" type="email" autoComplete="email" defaultValue={state.email} />
              </Field.Root>
              <Field.Root required>
                <Field.Label>Senha</Field.Label>
                <Input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={PASSWORD_MIN}
                  maxLength={128}
                />
                <Field.HelperText>Pelo menos {PASSWORD_MIN} caracteres.</Field.HelperText>
              </Field.Root>
              <Field.Root required>
                <Field.Label>Repita a senha</Field.Label>
                <Input
                  name="passwordConfirmation"
                  type="password"
                  autoComplete="new-password"
                  minLength={PASSWORD_MIN}
                  maxLength={128}
                />
              </Field.Root>
              <Field.Root>
                <Field.Label>
                  Nick do seu personagem
                  <Field.RequiredIndicator fallback="(opcional)" color="fg.muted" ms="1" />
                </Field.Label>
                <Input
                  name="gamePlayerUsername"
                  autoComplete="off"
                  maxLength={40}
                  defaultValue={state.gamePlayerUsername}
                />
                <Field.HelperText>
                  Exatamente como no jogo. Conferimos na BitJita; dá para escolher depois em Meu
                  personagem.
                </Field.HelperText>
              </Field.Root>
              <Button type="submit" loading={pending} loadingText="Criando…">
                Criar conta
              </Button>
            </Stack>
          </form>
        </Card.Body>
        <Card.Footer>
          <Text textStyle="sm" color="fg.muted">
            Já tem conta?{' '}
            <Link asChild color="colorPalette.fg" fontWeight="medium">
              <NextLink href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}>
                Entrar
              </NextLink>
            </Link>
          </Text>
        </Card.Footer>
      </Card.Root>
    </Center>
  )
}
