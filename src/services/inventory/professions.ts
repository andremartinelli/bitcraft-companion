/** Items no recipe makes: gathered, dropped or bought */
export const NO_PROFESSION = 'Sem receita (coleta, drop ou loja)'

/** The game's "ANY" skill: recipes any profession can do */
export const ANY_PROFESSION = 'Qualquer profissão'

/** Who has an item and how many, all of their places together */
export interface ItemHolder {
  owner: string
  quantity: number
}
