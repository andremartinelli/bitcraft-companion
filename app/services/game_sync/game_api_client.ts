/**
 * Read-only client for the BitCraft SpacetimeDB databases, over the HTTP SQL
 * route (POST /v1/database/{module}/sql). Rows come back as plain objects.
 */
export const GLOBAL_HOST = 'bitcraft-release.spacetimedb.com'
export const GLOBAL_MODULE = 'idc-global'

export class GameApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public detail?: string
  ) {
    super(message)
  }
}
export class TokenExpiredError extends GameApiError {}
export class RegionForbiddenError extends GameApiError {}
export class NetworkError extends GameApiError {}

type AlgebraicType = Record<string, any>

interface StatementResult {
  schema: { elements: { name: { some?: string } | string | null; algebraic_type: AlgebraicType }[] }
  rows: unknown[][]
}

const nameOf = (name: unknown): string | null => {
  if (typeof name === 'string') return name
  if (name && typeof name === 'object' && 'some' in name) return (name as { some: string }).some
  return null
}

/**
 * Decodes a SATS-JSON value into plain JS: products become objects (by field
 * name), sums become { tag: value } with Option<T> as T | null, and unit
 * enum variants (ItemType::Cargo) become the variant name.
 */
export function decodeValue(type: AlgebraicType | undefined, value: unknown): unknown {
  if (!type) return value

  if (type.Product) {
    const elements: { name: unknown; algebraic_type: AlgebraicType }[] = type.Product.elements
    // Identity, ConnectionId and Timestamp are single-field products: keep the inner value
    if (elements.length === 1 && nameOf(elements[0].name)?.startsWith('__')) {
      const inner = Array.isArray(value) ? value[0] : value
      return decodeValue(elements[0].algebraic_type, inner)
    }
    const values = Array.isArray(value)
      ? value
      : elements.map((e) => (value as Record<string, unknown>)?.[nameOf(e.name) ?? ''])
    return Object.fromEntries(
      elements.map((e, i) => [
        nameOf(e.name) ?? String(i),
        decodeValue(e.algebraic_type, values[i]),
      ])
    )
  }

  if (type.Sum) {
    const variants: { name: unknown; algebraic_type: AlgebraicType }[] = type.Sum.variants
    let tag: number
    let inner: unknown
    if (Array.isArray(value)) {
      ;[tag, inner] = value as [number, unknown]
    } else if (value && typeof value === 'object') {
      const [key, v] = Object.entries(value)[0]
      tag = /^\d+$/.test(key)
        ? Number(key)
        : variants.findIndex((variant) => nameOf(variant.name) === key)
      inner = v
    } else {
      return value
    }
    const variant = variants[tag]
    const variantName = nameOf(variant?.name) ?? String(tag)
    const names = variants.map((v) => nameOf(v.name))
    if (names.length === 2 && names.includes('some') && names.includes('none')) {
      return variantName === 'some' ? decodeValue(variant.algebraic_type, inner) : null
    }
    const isUnit = variant?.algebraic_type?.Product?.elements?.length === 0
    return isUnit ? variantName : { [variantName]: decodeValue(variant?.algebraic_type, inner) }
  }

  if (type.Array) {
    return Array.isArray(value) ? value.map((v) => decodeValue(type.Array, v)) : value
  }
  return value
}

export interface SqlOptions {
  host?: string
  module: string
  token: string | null
}

export async function sql<T = Record<string, unknown>>(
  query: string,
  options: SqlOptions
): Promise<T[][]> {
  const host = options.host ?? GLOBAL_HOST
  let response: Response
  try {
    response = await fetch(`https://${host}/v1/database/${options.module}/sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'User-Agent': 'bitcraft-companion',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: query,
    })
  } catch {
    throw new NetworkError(`Não foi possível conectar em ${host}.`)
  }

  const text = await response.text()
  if (response.status === 401) {
    throw new TokenExpiredError(
      'O token do BitCraft foi recusado (expirado ou inválido).',
      401,
      text.slice(0, 300)
    )
  }
  if (response.status === 403) {
    throw new RegionForbiddenError(
      `Sem permissão para ler ${options.module}.`,
      403,
      text.slice(0, 300)
    )
  }
  if (!response.ok) {
    throw new GameApiError(
      `${options.module} respondeu ${response.status}.`,
      response.status,
      text.slice(0, 300)
    )
  }

  const statements = JSON.parse(text) as StatementResult[]
  return statements.map((statement) => {
    const columns = statement.schema.elements
    return statement.rows.map(
      (row) =>
        Object.fromEntries(
          columns.map((c, i) => [
            nameOf(c.name) ?? String(i),
            decodeValue(c.algebraic_type, row[i]),
          ])
        ) as T
    )
  })
}

/** Raw response, for recording fixtures during the probe */
export async function sqlRaw(
  query: string,
  options: SqlOptions
): Promise<{ status: number; body: string }> {
  const host = options.host ?? GLOBAL_HOST
  const response = await fetch(`https://${host}/v1/database/${options.module}/sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'User-Agent': 'bitcraft-companion',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: query,
  })
  return { status: response.status, body: await response.text() }
}
