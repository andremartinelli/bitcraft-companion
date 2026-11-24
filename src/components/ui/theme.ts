import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react'

/**
 * Chakra's default look (neutral, light and dark), with the teal of the
 * prototype (docs/reference/bitcraft-receitas.html) as the accent color.
 */
const config = defineConfig({
  globalCss: {
    html: { colorPalette: 'teal' },
  },
})

export const system = createSystem(defaultConfig, config)
