import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import BitJitaClient, { RequestThrottle } from '@/services/game_sync/bitjita_client'
import { BitJitaInventorySource } from '@/services/game_sync/inventory_source'

/**
 * Fixtures in tests/fixtures/bitjita/ were recorded from real BitJita
 * responses (21/11/2026) and anonymized: ids, nicks, names and quantities are
 * fictitious, and the items are the ones in tests/fixtures/game_data/.
 */
const FIXTURES = fileURLToPath(new URL('../fixtures/bitjita/', import.meta.url))

export const PLAYER_ONE = { username: 'Nimbus', entityId: '100000000000000001' }
export const PLAYER_TWO = { username: 'Quartz', entityId: '100000000000000002' }
export const CLAIM = { entityId: '200000000000000001', name: 'Vila Teste' }
export const HOUSE_ID = '500000000000000001'

/** A fresh, mutable copy of a fixture */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function bitjitaFixture(name: string): any {
  return JSON.parse(readFileSync(`${FIXTURES}${name}.json`, 'utf8'))
}

export type FakeResponse = { status?: number; body?: unknown } | Error

/** The recorded answers for both players and the claim they share, by path */
export function recordedResponses(): Record<string, FakeResponse> {
  const one = `/api/players/${PLAYER_ONE.entityId}`
  const two = `/api/players/${PLAYER_TWO.entityId}`
  return {
    '/api/players?q=Nimbus': { body: bitjitaFixture('players_search') },
    [one]: { body: bitjitaFixture('player_one') },
    [`${one}/inventories`]: { body: bitjitaFixture('player_one_inventories') },
    [`${one}/housing`]: { status: 404, body: bitjitaFixture('housing_not_found') },
    [`${one}/traveler-tasks`]: { body: bitjitaFixture('player_one_traveler_tasks') },
    [two]: { body: bitjitaFixture('player_two') },
    [`${two}/inventories`]: { body: bitjitaFixture('player_two_inventories') },
    [`${two}/housing`]: { body: bitjitaFixture('player_two_housing') },
    [`${two}/housing/${HOUSE_ID}`]: { body: bitjitaFixture('player_two_house') },
    [`${two}/traveler-tasks`]: { body: bitjitaFixture('player_two_traveler_tasks') },
    [`/api/claims/${CLAIM.entityId}/inventories`]: { body: bitjitaFixture('claim_inventories') },
  }
}

export interface FakeBitJita {
  fetch: typeof fetch
  responses: Record<string, FakeResponse>
  calls: { path: string; headers: Headers }[]
}

/**
 * A fetch that answers from `responses` and records every call. Tests never
 * reach the internet: an unexpected path fails like a network error.
 */
export function fakeBitJita(responses = recordedResponses()): FakeBitJita {
  const fake: FakeBitJita = {
    responses,
    calls: [],
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      const path = `${url.pathname}${url.search}`
      fake.calls.push({ path, headers: new Headers(init?.headers) })
      const response = fake.responses[path]
      if (response instanceof Error) throw response
      if (!response) throw new Error(`unexpected BitJita call: ${path}`)
      return new Response(JSON.stringify(response.body ?? {}), {
        status: response.status ?? 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch,
  }
  return fake
}

/** The client without the delay between calls */
export function bitjitaClient(fake: FakeBitJita = fakeBitJita()) {
  return new BitJitaClient({ fetch: fake.fetch, throttle: new RequestThrottle(0) })
}

export function bitjitaSource(fake: FakeBitJita = fakeBitJita()) {
  return new BitJitaInventorySource(bitjitaClient(fake))
}

/** Every path answers with `response` (BitJita down, rate limited...) */
export function everyPathAnswers(response: FakeResponse) {
  return Object.fromEntries(Object.keys(recordedResponses()).map((path) => [path, response]))
}
