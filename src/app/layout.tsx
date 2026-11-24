import type { Metadata } from 'next'
import Script from 'next/script'
import type { ReactNode } from 'react'
import { THEME_SCRIPT } from '@/components/ui/color_mode'
import { Provider } from '@/components/ui/provider'

export const metadata: Metadata = {
  title: { default: 'BitCraft Companion', template: '%s - BitCraft Companion' },
  description: 'Receitas, custos, planos e o inventário do grupo no BitCraft Online.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme script adds a class to <html> before React hydrates
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <Script id="theme" strategy="beforeInteractive">
          {THEME_SCRIPT}
        </Script>
        <Provider>{children}</Provider>
      </body>
    </html>
  )
}
