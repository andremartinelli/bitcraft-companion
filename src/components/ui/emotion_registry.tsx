'use client'

import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import { useServerInsertedHTML } from 'next/navigation'
import { useState, type ReactNode } from 'react'

/**
 * Chakra styles with Emotion. Without this, the server writes Emotion's
 * <style> tags in the middle of <body> and React fails to hydrate the page.
 * Here they are collected while rendering and sent in the head instead
 * (the same approach as MUI's AppRouterCacheProvider).
 */
export function EmotionRegistry({ children }: { children: ReactNode }) {
  const [registry] = useState(() => {
    const cache = createCache({ key: 'css' })
    cache.compat = true
    const insert = cache.insert
    let inserted: { name: string; global: boolean }[] = []
    cache.insert = (...args) => {
      const [selector, serialized] = args
      if (cache.inserted[serialized.name] === undefined) {
        inserted.push({ name: serialized.name, global: !selector })
      }
      return insert(...args)
    }
    const flush = () => {
      const names = inserted
      inserted = []
      return names
    }
    return { cache, flush }
  })

  useServerInsertedHTML(() => {
    const names = registry.flush()
    if (!names.length) return null

    let styles = ''
    let attribute = registry.cache.key
    const globals: { name: string; style: string }[] = []
    for (const { name, global } of names) {
      const style = registry.cache.inserted[name]
      if (typeof style !== 'string') continue
      if (global) globals.push({ name, style })
      else {
        styles += style
        attribute += ` ${name}`
      }
    }

    return (
      <>
        {globals.map(({ name, style }) => (
          <style
            key={name}
            data-emotion={`${registry.cache.key}-global ${name}`}
            dangerouslySetInnerHTML={{ __html: style }}
          />
        ))}
        {styles && <style data-emotion={attribute} dangerouslySetInnerHTML={{ __html: styles }} />}
      </>
    )
  })

  return <CacheProvider value={registry.cache}>{children}</CacheProvider>
}
