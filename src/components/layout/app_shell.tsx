'use client'

import { Badge, Box, Button, Code, Container, Flex, HStack, Link, Text } from '@chakra-ui/react'
import NextLink from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import {
  LuBookOpen,
  LuCalculator,
  LuClipboardList,
  LuLogOut,
  LuPackage,
  LuSettings,
} from 'react-icons/lu'
import { destroySession } from '@/app/login/actions'
import { ColorModeButton } from '@/components/ui/color_mode_button'

/** Every area of the app. A new area gets an entry here */
const NAV = [
  { label: 'Planos', href: '/plans', icon: LuClipboardList },
  { label: 'Receitas', href: '/recipes', icon: LuBookOpen },
  { label: 'Calculadora', href: '/calculator', icon: LuCalculator },
  { label: 'Inventário', href: '/inventory', icon: LuPackage },
]

interface AppShellProps {
  /** "21/11/2026": the date of the game data, or null before the first import */
  gameDataDate: string | null
  /** Who is logged in: the name, or the e-mail */
  userName: string
  /** Group invites waiting for the account, shown on "Conta" */
  inviteCount: number
  children: ReactNode
}

/** Header, menu and the page */
export function AppShell({ gameDataDate, userName, inviteCount, children }: AppShellProps) {
  const pathname = usePathname()

  return (
    <Box minH="100dvh" bg="bg.subtle">
      <Box as="header" bg="bg" borderBottomWidth="1px">
        <Container maxW="7xl">
          <Flex h="14" align="center" justify="space-between" gap="4">
            <Link asChild fontWeight="semibold" fontSize="lg" _hover={{ textDecoration: 'none' }}>
              <NextLink href="/plans">BitCraft Companion</NextLink>
            </Link>
            <HStack gap="3">
              <Text textStyle="sm" color="fg.muted" hideBelow="sm">
                {gameDataDate ? (
                  <>Dados do jogo de {gameDataDate}</>
                ) : (
                  <>
                    Sem dados do jogo: rode <Code>npm run game-data:import</Code>
                  </>
                )}
              </Text>
              <ColorModeButton />
              <Text textStyle="sm" fontWeight="medium" hideBelow="md">
                {userName}
              </Text>
              <Button asChild size="sm" variant="ghost">
                <NextLink
                  href="/account"
                  aria-label={
                    inviteCount
                      ? `Conta: ${inviteCount} ${inviteCount === 1 ? 'convite' : 'convites'} de grupo`
                      : undefined
                  }
                >
                  <LuSettings aria-hidden />
                  Conta
                  {inviteCount > 0 && (
                    <Badge colorPalette="blue" variant="solid" size="sm" aria-hidden>
                      {inviteCount}
                    </Badge>
                  )}
                </NextLink>
              </Button>
              <form action={destroySession}>
                <Button type="submit" size="sm" variant="outline">
                  <LuLogOut aria-hidden />
                  Sair
                </Button>
              </form>
            </HStack>
          </Flex>
        </Container>
        <Container maxW="7xl">
          <HStack as="nav" gap="1" aria-label="Menu" overflowX="auto">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <Link
                  key={item.href}
                  asChild
                  px="3"
                  py="2"
                  textStyle="sm"
                  fontWeight="medium"
                  color={active ? 'fg' : 'fg.muted'}
                  borderBottomWidth="2px"
                  borderColor={active ? 'colorPalette.solid' : 'transparent'}
                  _hover={{ color: 'fg', textDecoration: 'none' }}
                >
                  <NextLink href={item.href} aria-current={active ? 'page' : undefined}>
                    <item.icon aria-hidden />
                    {item.label}
                  </NextLink>
                </Link>
              )
            })}
          </HStack>
        </Container>
      </Box>
      <Container as="main" maxW="7xl" py="6">
        {children}
      </Container>
    </Box>
  )
}
