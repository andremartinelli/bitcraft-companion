import { formatNumber } from '@/lib/format'

/** Items no recipe makes: gathered, dropped or bought */
export const NO_PROFESSION = 'Sem receita (coleta, drop ou loja)'

/** The game's "ANY" skill: recipes any profession can do */
export const ANY_PROFESSION = 'Qualquer profissão'

/** Who has an item and how many, all of their places together, and in which places */
export interface ItemHolder {
  owner: string
  quantity: number
  /** The bank, the backpack, each chest by its name: the one with most first */
  places: { name: string; quantity: number }[]
}

/**
 * "Nimbus 40 (Banco 30, Mochila 10) · Claim Aurora 100 (Baú Grande)": a
 * single place goes without its number, which is the owner's
 */
export function holdersLabel(holders: ItemHolder[]) {
  return holders
    .map(({ owner, quantity, places }) => {
      const where =
        places.length === 1
          ? places[0].name
          : places.map((place) => `${place.name} ${formatNumber(place.quantity)}`).join(', ')
      return `${owner} ${formatNumber(quantity)} (${where})`
    })
    .join(' · ')
}
