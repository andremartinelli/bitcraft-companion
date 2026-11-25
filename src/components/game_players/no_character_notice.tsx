'use client'

import { HStack, Link, Text } from '@chakra-ui/react'
import NextLink from 'next/link'
import { LuTriangleAlert } from 'react-icons/lu'

/** Next to the inventory's state, for an account with no character */
export function NoCharacterNotice() {
  return (
    <HStack gap="1.5" role="status">
      <Text as="span" color="fg.warning" display="inline-flex">
        <LuTriangleAlert aria-hidden />
      </Text>
      <Text textStyle="sm">
        Você não tem personagem. Escolha em{' '}
        <Link asChild color="colorPalette.fg" fontWeight="medium">
          <NextLink href="/game_player">Meu personagem</NextLink>
        </Link>
      </Text>
    </HStack>
  )
}
