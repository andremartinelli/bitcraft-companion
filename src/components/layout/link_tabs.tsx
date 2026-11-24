'use client'

import { HStack, Link } from '@chakra-ui/react'
import NextLink from 'next/link'

export interface LinkTab {
  label: string
  href: string
  active: boolean
}

/** Tabs that are links: each one is a URL (Crafting or Construção, inventory views) */
export function LinkTabs({ tabs, label }: { tabs: LinkTab[]; label: string }) {
  return (
    <HStack as="nav" aria-label={label} gap="0" borderBottomWidth="1px" mb="4">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          asChild
          px="3"
          py="2"
          mb="-1px"
          textStyle="sm"
          fontWeight="medium"
          color={tab.active ? 'fg' : 'fg.muted'}
          borderBottomWidth="2px"
          borderColor={tab.active ? 'colorPalette.solid' : 'transparent'}
          _hover={{ color: 'fg', textDecoration: 'none' }}
        >
          <NextLink href={tab.href} aria-current={tab.active ? 'page' : undefined}>
            {tab.label}
          </NextLink>
        </Link>
      ))}
    </HStack>
  )
}
