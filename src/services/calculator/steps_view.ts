/**
 * How the Steps show each profession for the account looking (decided
 * 2026-11-27): its professions ("Minhas profissões") first, and the steps of
 * the others shown, collapsed or hidden. Pure, for the client component.
 */

export type OtherStepsMode = 'show' | 'collapse' | 'hide'

/** The account's profession names and what to do with the others */
export interface StepsSetting {
  professions: string[]
  otherSteps: OtherStepsMode
}

/**
 * Someone else's profession: a named one the account doesn't do. "Any
 * profession" and no recipe (skill null) never are, and an account with no
 * profession marked has none.
 */
export const isOtherProfession = (skill: string | null, mine: string[]) =>
  mine.length > 0 && skill !== null && !mine.includes(skill)

/** The account's professions first, then the others, keeping the order within each */
export function mineFirst<T extends { skill: string | null }>(groups: T[], mine: string[]) {
  const rank = (group: T) => (group.skill !== null && mine.includes(group.skill) ? 0 : 1)
  return groups
    .map((group, index) => ({ group, index }))
    .sort((a, b) => rank(a.group) - rank(b.group) || a.index - b.index)
    .map(({ group }) => group)
}
