/**
 * How the Steps show each profession for the account looking (decided
 * 2026-11-27): its professions ("Minhas profissões") first, and the steps of
 * the others shown, collapsed or hidden. Pure, for the client component.
 */

export type OtherStepsMode = 'show' | 'collapse' | 'hide'

/** The account's profession names and what to do with the others */
export interface StepsSetting {
  professions: string[]
  /** Every profession of "Minhas profissões": other skills (Construction, Taming...) always show */
  allProfessions: string[]
  otherSteps: OtherStepsMode
}

/**
 * Someone else's profession: one of the professions the account doesn't do.
 * "Any profession", no recipe (skill null) and skills that are not
 * professions (Construction, Taming...) never are, and an account with no
 * profession marked has none.
 */
export const isOtherProfession = (skill: string | null, mine: string[], all: string[]) =>
  mine.length > 0 && skill !== null && all.includes(skill) && !mine.includes(skill)

/** The gathering professions: first in the view by profession (decided 2026-11-27) */
export const GATHERING_PROFESSIONS = ['Fishing', 'Foraging', 'Hunting', 'Mining', 'Forestry']

/**
 * The account's professions first, then the others, keeping the order within
 * each. `gatheringFirst`: within each, the gathering professions first
 */
export function mineFirst<T extends { skill: string | null }>(
  groups: T[],
  mine: string[],
  gatheringFirst = false
) {
  const rank = (group: T) =>
    (group.skill !== null && mine.includes(group.skill) ? 0 : 2) +
    (gatheringFirst && GATHERING_PROFESSIONS.includes(group.skill ?? '') ? 0 : 1)
  return groups
    .map((group, index) => ({ group, index }))
    .sort((a, b) => rank(a.group) - rank(b.group) || a.index - b.index)
    .map(({ group }) => group)
}
