import { db } from '@/lib/db'

/**
 * Which kinds of building of the counted claims count toward the account's
 * inventory ("Meu personagem", decided 26/11/2026). Per account, for all its
 * claims; in a plan, the choice of whoever is looking.
 *
 * Without a choice, the game data decides: kinds the claim's members open
 * ("Claim": chests, cargo bins, stockpiles) count; the others ("All": a barter
 * stall's stock, open to anyone) don't. The empire's ("Empire": the Hexite
 * Reserve) never count and can't be chosen.
 */

export const NEVER_COUNTED = 'Empire'

export interface ClaimBuildingKind {
  buildingId: number
  name: string
  /** How many of these buildings the claims have */
  buildings: number
  counted: boolean
  /** false for the empire's: they never count, so the page doesn't list them */
  choosable: boolean
}

/** The kinds of building among these claims' chests, as of the last read, each with whether the account counts it */
export async function claimBuildingKinds(
  userId: number,
  claimIds: string[]
): Promise<ClaimBuildingKind[]> {
  if (!claimIds.length) return []
  const groups = await db.inventoryContainer.groupBy({
    by: ['buildingId'],
    where: { kind: 'claim', claimEntityId: { in: claimIds }, buildingId: { not: null } },
    _count: true,
  })
  const ids = groups.map((group) => group.buildingId!)
  const [buildings, choices] = await Promise.all([
    db.building.findMany({ where: { id: { in: ids } } }),
    db.claimBuildingChoice.findMany({ where: { userId, buildingId: { in: ids } } }),
  ])
  const byId = new Map(buildings.map((building) => [building.id, building]))
  const chosen = new Map(choices.map((choice) => [choice.buildingId, choice.counted]))
  return groups
    .map((group) => {
      const id = group.buildingId!
      // A kind the game data import has not brought yet counts, as every chest did before
      const building = byId.get(id) ?? { name: `Prédio ${id}`, interactPermission: 'Claim' }
      const choosable = building.interactPermission !== NEVER_COUNTED
      return {
        buildingId: id,
        name: building.name,
        buildings: group._count,
        counted: choosable && (chosen.get(id) ?? building.interactPermission === 'Claim'),
        choosable,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** The kinds of building whose chests these claims leave out for the account: StockOwners.excludedBuildingIds */
export async function excludedBuildingIds(userId: number, claimIds: string[]) {
  return (await claimBuildingKinds(userId, claimIds))
    .filter((kind) => !kind.counted)
    .map((kind) => kind.buildingId)
}

/**
 * Counts a kind of building for the account, or not.
 * @returns false when the kind does not exist or is the empire's
 */
export async function saveClaimBuildingChoice(
  userId: number,
  buildingId: number,
  counted: boolean
) {
  const building = await db.building.findUnique({
    where: { id: buildingId },
    select: { interactPermission: true },
  })
  if (!building || building.interactPermission === NEVER_COUNTED) return false
  await db.claimBuildingChoice.upsert({
    where: { userId_buildingId: { userId, buildingId } },
    create: { userId, buildingId, counted },
    update: { counted },
  })
  return true
}
