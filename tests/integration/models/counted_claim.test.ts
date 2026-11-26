import { beforeEach, describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import { accountClaims, saveCountedClaim } from '@/models/counted_claim'
import { claimGamePlayer } from '@/models/game_player'
import InventorySync from '@/services/game_sync/inventory_sync'
import { bitjitaSource, CLAIM } from '../../helpers/bitjita'
import { importTables } from '../../helpers/game_data'
import { syncBothPlayers } from '../../helpers/inventory'

const claimChests = () => db.inventoryContainer.count({ where: { kind: 'claim' } })

describe('counted claims', () => {
  let accounts: Awaited<ReturnType<typeof syncBothPlayers>>

  beforeEach(async () => {
    await importTables()
    accounts = await syncBothPlayers()
  })

  test("only a claim of the account's character can be switched on", async () => {
    expect(await saveCountedClaim(accounts.userId, '999', true)).toBe(false)
    expect(await db.countedClaim.count()).toBe(0)

    expect(await saveCountedClaim(accounts.userId, CLAIM.entityId, true)).toBe(true)
    expect(await accountClaims(accounts.userId)).toEqual([
      { entityId: CLAIM.entityId, name: CLAIM.name, counted: true },
    ])
    // Switched on twice is still one row
    await saveCountedClaim(accounts.userId, CLAIM.entityId, true)
    expect(await db.countedClaim.count()).toBe(1)
  })

  test('switched on, the character is read again on the next page', async () => {
    await saveCountedClaim(accounts.userId, CLAIM.entityId, true)
    const player = await db.gamePlayer.findUniqueOrThrow({ where: { id: accounts.playerIds[0] } })
    expect(player.lastAttemptAt).toBeNull()
  })

  test('switched off, the chests go once no account counts the claim', async () => {
    await saveCountedClaim(accounts.userId, CLAIM.entityId, true)
    await saveCountedClaim(accounts.partnerId, CLAIM.entityId, true)
    await new InventorySync(bitjitaSource()).run('manual')
    expect(await claimChests()).toBe(3)

    await saveCountedClaim(accounts.userId, CLAIM.entityId, false)
    expect(await claimChests()).toBe(3)
    expect((await accountClaims(accounts.userId))[0].counted).toBe(false)

    await saveCountedClaim(accounts.partnerId, CLAIM.entityId, false)
    expect(await claimChests()).toBe(0)
  })

  test('another character: the claims counted were the old one’s', async () => {
    await saveCountedClaim(accounts.userId, CLAIM.entityId, true)
    await claimGamePlayer(accounts.userId, {
      entityId: '100000000000000009',
      username: 'Outro',
      regionId: null,
      claims: [],
    })
    expect(await db.countedClaim.count()).toBe(0)
  })
})
