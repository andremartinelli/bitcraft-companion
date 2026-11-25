import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { ItemDetails } from '@/components/items/item_details'
import { formatNumber, formatPercent } from '@/lib/format'
import { requireUser } from '@/lib/session'
import { consumingRecipes, findActiveItem, producingRecipes } from '@/models/item'
import { db } from '@/lib/db'
import { inventoryScope } from '@/services/inventory/scope'
import { itemStock } from '@/services/inventory/stock'
import { itemIdSchema } from '@/validators/item'

interface ItemPageProps {
  params: Promise<{ id: string }>
}

/** Once per request: the title and the page read the same item */
const loadItem = cache(async (rawId: string) => {
  const id = itemIdSchema.safeParse(rawId)
  return id.success ? findActiveItem(id.data) : null
})

export async function generateMetadata({ params }: ItemPageProps): Promise<Metadata> {
  const item = await loadItem((await params).id)
  return { title: item?.name ?? 'Item' }
}

/**
 * GET /items/[id]: how to get the item and where it is used. An item that
 * left the game, or an id that is not a number, is a 404.
 */
export default async function ItemPage({ params }: ItemPageProps) {
  const user = await requireUser()
  const item = await loadItem((await params).id)
  if (!item) notFound()

  const { playerIds } = await inventoryScope(user.id)
  const [producers, consumers, synced] = await Promise.all([
    producingRecipes(item.id),
    consumingRecipes(item.id),
    db.gamePlayer.count({ where: { id: { in: playerIds }, lastSyncedAt: { not: null } } }),
  ])
  // "Você tem" once the account's character was read
  const stock = synced ? await itemStock(item.id, playerIds) : null

  return (
    <ItemDetails
      item={{
        id: item.id,
        name: item.name,
        tier: item.tier,
        rarity: item.rarity,
        iconAssetName: item.iconAssetName,
        kind: item.kind,
        tag: item.tag,
        description: item.description,
      }}
      producers={producers.map(({ recipe, quantity, chance }) => ({
        recipe,
        note:
          chance === null
            ? `Rende ${formatNumber(quantity)} por craft`
            : `Saída aleatória: ${formatPercent(chance)} de chance, ${formatNumber(quantity)} em média por craft`,
      }))}
      consumers={consumers.map((recipe) => ({ recipe }))}
      stock={stock}
    />
  )
}
