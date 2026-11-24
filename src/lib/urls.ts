/** The URL of a page of a list, keeping the other parameters (page 1 has none) */
export function pageHref(pathname: string, query: Record<string, string>, page: number) {
  const params = new URLSearchParams(query)
  if (page > 1) params.set('page', String(page))
  else params.delete('page')
  const search = params.toString()
  return search ? `${pathname}?${search}` : pathname
}

/** A list's query string as plain pairs (first value of each), blanks dropped */
export function plainQuery(params: Record<string, string | string[] | undefined>) {
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value
    if (first !== undefined && first !== '') query[key] = first
  }
  return query
}
