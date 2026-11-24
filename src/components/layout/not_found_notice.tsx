'use client'

import { Button, Center, Heading, Stack, Text } from '@chakra-ui/react'
import NextLink from 'next/link'

export function NotFoundNotice() {
  return (
    <Center minH="100dvh" p="6">
      <Stack gap="3" textAlign="center" align="center">
        <Heading size="2xl">Página não encontrada</Heading>
        <Text color="fg.muted">
          O endereço não existe, ou o item saiu do jogo na última atualização dos dados.
        </Text>
        <Button asChild size="sm" variant="outline">
          <NextLink href="/plans">Voltar para os planos</NextLink>
        </Button>
      </Stack>
    </Center>
  )
}
