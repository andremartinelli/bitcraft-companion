'use client'

import { IconButton, Skeleton } from '@chakra-ui/react'
import { useSyncExternalStore } from 'react'
import { LuMoon, LuSun } from 'react-icons/lu'
import { applyColorMode } from '@/components/ui/color_mode'

/** Follows the class on <html>, which THEME_SCRIPT sets before React runs */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

const isDark = () => document.documentElement.classList.contains('dark')

/** Light or dark theme. The server cannot know it: a placeholder until the browser says */
export function ColorModeButton() {
  const dark = useSyncExternalStore(subscribe, isDark, () => null)
  if (dark === null) return <Skeleton boxSize="8" />

  return (
    <IconButton
      variant="ghost"
      size="sm"
      aria-label={dark ? 'Usar tema claro' : 'Usar tema escuro'}
      onClick={() => applyColorMode(dark ? 'light' : 'dark')}
    >
      {dark ? <LuSun /> : <LuMoon />}
    </IconButton>
  )
}
