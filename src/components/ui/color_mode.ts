/**
 * Light or dark theme: a class on <html> ("light" or "dark", which Chakra's
 * dark mode reads), remembered in this browser. THEME_SCRIPT runs before the
 * page shows (root layout), so there is no flash of the wrong theme.
 */

export type ColorMode = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'theme'

export const THEME_SCRIPT = `try {
  var mode = localStorage.getItem('${THEME_STORAGE_KEY}')
  if (mode !== 'light' && mode !== 'dark') {
    mode = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  document.documentElement.classList.add(mode)
  document.documentElement.style.colorScheme = mode
} catch (e) {}`

export function applyColorMode(mode: ColorMode) {
  const html = document.documentElement
  html.classList.remove('light', 'dark')
  html.classList.add(mode)
  html.style.colorScheme = mode
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // Storage blocked: the theme still changes, just not remembered
  }
}
