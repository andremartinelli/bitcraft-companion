/**
 * BitCraft's e-mail + access code login, as documented by community tools
 * (not an official API): request a code by e-mail, then trade it for a token.
 * E-mails, codes and tokens are never logged.
 */
const AUTH_BASE = 'https://api.bitcraftonline.com/authentication'

export class GameAuthError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message)
  }
}

async function post(path: string, params: Record<string, string>) {
  const url = `${AUTH_BASE}/${path}?${new URLSearchParams(params)}`
  let response: Response
  try {
    response = await fetch(url, { method: 'POST', headers: { 'User-Agent': 'bitcraft-companion' } })
  } catch {
    throw new GameAuthError('Não foi possível falar com o servidor de login do BitCraft.')
  }
  const body = await response.text()
  if (!response.ok) {
    throw new GameAuthError(
      `O servidor de login do BitCraft respondeu ${response.status}.`,
      response.status
    )
  }
  return body
}

/** Finds the JWT in the authenticate response, whatever its exact shape */
export function extractToken(body: string): string | null {
  const clean = (value: string) =>
    value
      .trim()
      .replace(/^Bearer\s+/i, '')
      .replace(/^"|"$/g, '')
  const looksLikeJwt = (value: string) => /^ey[\w-]+\.[\w-]+\.[\w-]+$/.test(clean(value))

  if (looksLikeJwt(body)) return clean(body)
  try {
    const parsed = JSON.parse(body)
    const queue: unknown[] = [parsed]
    while (queue.length) {
      const value = queue.shift()
      if (typeof value === 'string' && looksLikeJwt(value)) return clean(value)
      if (value && typeof value === 'object') queue.push(...Object.values(value))
    }
  } catch {
    // not JSON
  }
  return null
}

export async function requestCode(email: string) {
  await post('request-access-code', { email })
}

export async function authenticate(email: string, accessCode: string): Promise<string> {
  const body = await post('authenticate', { email, accessCode })
  const token = extractToken(body)
  if (!token) throw new GameAuthError('O login respondeu, mas sem um token reconhecível.')
  return token
}

/**
 * Claim names in the token, without their values. Used to see which claim
 * carries the SpacetimeDB identity.
 */
export function tokenClaims(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return {}
  }
}
