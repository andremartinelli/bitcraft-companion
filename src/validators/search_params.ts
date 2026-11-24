import { z } from 'zod'

/** What Next passes as a page's searchParams */
export type SearchParams = Record<string, string | string[] | undefined>

/** An optional whole number from the query string ("" and absent are the same) */
export const queryInt = (min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) =>
  z.coerce.number().int().min(min).max(max).optional()

/** A checkbox in the query string: "true", "1" or "on" */
export const queryFlag = () =>
  z
    .enum(['true', '1', 'on', 'false', '0'])
    .transform((value) => value === 'true' || value === '1' || value === 'on')
    .optional()

/**
 * Filters from the query string. A filter that does not validate is dropped
 * (back to its default) instead of failing the page, like an unknown tab.
 */
export function parseSearchParams<T extends z.ZodObject>(
  schema: T,
  params: SearchParams
): z.infer<T> {
  const input: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value
    if (first !== undefined && first.trim() !== '') input[key] = first
  }

  const result = schema.safeParse(input)
  if (result.success) return result.data

  for (const issue of result.error.issues) delete input[String(issue.path[0])]
  return schema.parse(input)
}
