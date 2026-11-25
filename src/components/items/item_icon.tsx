'use client'

import { Image } from '@chakra-ui/react'
import { itemIconUrl } from '@/lib/item_icon'

/** An image that failed before React took over the page fires no onError: check on mount */
function hideIfBroken(img: HTMLImageElement | null) {
  if (img?.complete && !img.naturalWidth) img.hidden = true
}

/** The item's icon in the game; nothing when it has none or the image does not load */
export function ItemIcon({ assetName, size = '5' }: { assetName: string | null; size?: string }) {
  const src = itemIconUrl(assetName)
  if (!src) return null
  return (
    <Image
      // A new element per image: one that failed stays hidden only for itself
      key={src}
      ref={hideIfBroken}
      src={src}
      // The name is always next to it
      alt=""
      boxSize={size}
      flexShrink={0}
      loading="lazy"
      onError={(event) => {
        event.currentTarget.hidden = true
      }}
    />
  )
}
