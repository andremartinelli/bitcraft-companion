/**
 * Text search: every word must match, ignoring case. Prisma's `contains`
 * does not escape LIKE wildcards ("_" would match any letter), so they are
 * escaped here.
 */

/** "Simple  PLANK" → ["simple", "plank"] */
export function searchWords(q: string | null | undefined) {
  return (q ?? '').toLowerCase().split(/\s+/).filter(Boolean)
}

/** A word as a literal LIKE pattern: %, _ and \ lose their meaning */
export function escapeLike(word: string) {
  return word.replace(/[\\%_]/g, '\\$&')
}

/** Prisma filter: the column contains the word, ignoring case */
export function containsWord(word: string) {
  return { contains: escapeLike(word), mode: 'insensitive' as const }
}
