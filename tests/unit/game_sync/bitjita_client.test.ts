import { describe, expect, test } from 'vitest'
import BitJitaClient, {
  NotFoundError,
  RateLimitedError,
  RequestThrottle,
  UpstreamError,
} from '@/services/game_sync/bitjita_client'
import { bitjitaClient, fakeBitJita, PLAYER_ONE } from '../../helpers/bitjita'

describe('BitJita client', () => {
  test('identifies itself with the User-Agent and reads JSON', async () => {
    const fake = fakeBitJita()
    const { player } = await bitjitaClient(fake).player(PLAYER_ONE.entityId)

    expect(player.username).toBe('Nimbus')
    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0].headers.get('user-agent')).toBe('bitcraft-companion')
    expect(fake.calls[0].path).toBe(`/api/players/${PLAYER_ONE.entityId}`)
  })

  test('turns 404, 429 and other failures into typed errors', async () => {
    const client = bitjitaClient(
      fakeBitJita({
        '/api/players/404': { status: 404, body: { error: 'Player not found' } },
        '/api/players/429': { status: 429, body: { error: 'Too many requests' } },
        '/api/players/503': { status: 503, body: {} },
        '/api/players/down': new TypeError('fetch failed'),
      })
    )

    await expect(client.player('404')).rejects.toBeInstanceOf(NotFoundError)
    await expect(client.player('429')).rejects.toBeInstanceOf(RateLimitedError)
    await expect(client.player('503')).rejects.toBeInstanceOf(UpstreamError)
    await expect(client.player('down')).rejects.toBeInstanceOf(UpstreamError)
  })

  test('an answer that is not JSON is an upstream error', async () => {
    const client = new BitJitaClient({
      fetch: (async () =>
        new Response('<html>maintenance</html>', { status: 200 })) as typeof fetch,
      throttle: new RequestThrottle(0),
    })

    await expect(client.player('1')).rejects.toBeInstanceOf(UpstreamError)
  })

  test('waits for the throttle before every request', async () => {
    let waits = 0
    const throttle = new RequestThrottle(0)
    throttle.wait = async () => {
      waits++
    }
    const client = new BitJitaClient({ fetch: fakeBitJita().fetch, throttle })

    await client.player(PLAYER_ONE.entityId)
    await client.playerInventories(PLAYER_ONE.entityId)

    expect(waits).toBe(2)
  })

  test('the throttle starts at most one request every 500 ms', async () => {
    const sleeps: number[] = []
    const throttle = new RequestThrottle(
      500,
      () => 1_000,
      async (ms) => {
        sleeps.push(ms)
      }
    )

    await Promise.all([throttle.wait(), throttle.wait(), throttle.wait()])

    expect(sleeps).toEqual([500, 1000])
  })
})
