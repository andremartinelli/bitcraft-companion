import { beforeEach, describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import { claimBuildingKinds, saveClaimBuildingChoice } from '@/models/claim_building_choice'
import { saveCountedClaim } from '@/models/counted_claim'
import InventorySync from '@/services/game_sync/inventory_sync'
import { inventoryScope } from '@/services/inventory/scope'
import { stockTotals } from '@/services/inventory/stock'
import { bitjitaSource, CLAIM } from '../../helpers/bitjita'
import { importTables } from '../../helpers/game_data'
import { syncBothPlayers } from '../../helpers/inventory'

// The fixture claim: two Sturdy Large Chests ("Claim"), a Sturdy Barter Stall ("All")
// with 5 of item 1020 and a Hexite Reserve ("Empire") with 4 of cargo 1010
const CHEST = 3007
const BARTER_STALL = 3210
const HEXITE_RESERVE = 90001

const itemId = async (kind: 'item' | 'cargo', gameId: number) =>
  (await db.item.findUniqueOrThrow({ where: { kind_gameId: { kind, gameId } } })).id

describe('kinds of building of the counted claims', () => {
  let userId: number

  beforeEach(async () => {
    await importTables()
    userId = (await syncBothPlayers()).userId
    await saveCountedClaim(userId, CLAIM.entityId, true)
    await new InventorySync(bitjitaSource()).run('manual')
  })

  /** What the account's inventory has of an item: its character and the counted claims */
  const stock = async (kind: 'item' | 'cargo', gameId: number) =>
    (await stockTotals(await inventoryScope(userId))).get(await itemId(kind, gameId)) ?? 0

  test("by default, the members' chests count; the barter stall doesn't; the empire's never", async () => {
    expect(await claimBuildingKinds(userId, [CLAIM.entityId])).toEqual([
      {
        buildingId: HEXITE_RESERVE,
        name: 'Hexite Reserve',
        buildings: 1,
        counted: false,
        choosable: false,
      },
      {
        buildingId: BARTER_STALL,
        name: 'Sturdy Barter Stall',
        buildings: 1,
        counted: false,
        choosable: true,
      },
      {
        buildingId: CHEST,
        name: 'Sturdy Large Chest',
        buildings: 2,
        counted: true,
        choosable: true,
      },
    ])
    expect((await inventoryScope(userId)).excludedBuildingIds?.sort()).toEqual(
      [BARTER_STALL, HEXITE_RESERVE].sort()
    )
  })

  test('the stock follows the choice; the Hexite Reserve cannot be chosen', async () => {
    const before = await stock('item', 1020)
    const cargo = await stock('cargo', 1010)

    expect(await saveClaimBuildingChoice(userId, BARTER_STALL, true)).toBe(true)
    expect(await stock('item', 1020)).toBe(before + 5)

    expect(await saveClaimBuildingChoice(userId, CHEST, false)).toBe(true)
    expect(await stock('item', 1020)).toBe(before + 5 - 15)

    expect(await saveClaimBuildingChoice(userId, HEXITE_RESERVE, true)).toBe(false)
    expect(await saveClaimBuildingChoice(userId, 123456, true)).toBe(false)
    expect(await stock('cargo', 1010)).toBe(cargo)
    expect(await db.claimBuildingChoice.count()).toBe(2)
  })

  test("the choice is the account's: another account counting the claim keeps the defaults", async () => {
    await saveClaimBuildingChoice(userId, BARTER_STALL, true)
    const partner = await db.user.findFirstOrThrow({ where: { email: 'parceiro@example.com' } })
    const kinds = await claimBuildingKinds(partner.id, [CLAIM.entityId])
    expect(kinds.find((kind) => kind.buildingId === BARTER_STALL)?.counted).toBe(false)
  })

  test('a chest read before its kind was known counts', async () => {
    await db.inventoryContainer.updateMany({ where: { kind: 'claim' }, data: { buildingId: null } })
    expect(await claimBuildingKinds(userId, [CLAIM.entityId])).toEqual([])
    expect(await stock('cargo', 1010)).toBeGreaterThanOrEqual(4)
  })
})
