import { test } from '@japa/runner'
import BitJitaClient, {
  NotFoundError,
  RateLimitedError,
  RequestThrottle,
  UpstreamError,
} from '#services/game_sync/bitjita_client'
import { bitjitaClient, fakeBitJita, PLAYER_ONE } from '#tests/helpers/bitjita'

test.group('BitJita client', () => {
  test('identifies itself with the User-Agent and reads JSON', async ({ assert }) => {
    const fake = fakeBitJita()
    const { player } = await bitjitaClient(fake).player(PLAYER_ONE.entityId)

    assert.equal(player.username, 'Nimbus')
    assert.lengthOf(fake.calls, 1)
    assert.equal(fake.calls[0].headers.get('user-agent'), 'bitcraft-companion')
    assert.equal(fake.calls[0].path, `/api/players/${PLAYER_ONE.entityId}`)
  })

  test('turns 404, 429 and other failures into typed errors', async ({ assert }) => {
    const fake = fakeBitJita({
      '/api/players/404': { status: 404, body: { error: 'Player not found' } },
      '/api/players/429': { status: 429, body: { error: 'Too many requests' } },
      '/api/players/503': { status: 503, body: {} },
      '/api/players/down': new TypeError('fetch failed'),
    })
    const client = bitjitaClient(fake)

    await assert.rejects(() => client.player('404'), NotFoundError)
    await assert.rejects(() => client.player('429'), RateLimitedError)
    await assert.rejects(() => client.player('503'), UpstreamError)
    await assert.rejects(() => client.player('down'), UpstreamError)
  })

  test('an answer that is not JSON is an upstream error', async ({ assert }) => {
    const client = new BitJitaClient({
      fetch: (async () => new Response('<html>maintenance</html>', { status: 200 })) as any,
      throttle: new RequestThrottle(0),
    })

    await assert.rejects(() => client.player('1'), UpstreamError)
  })

  test('waits for the throttle before every request', async ({ assert }) => {
    let waits = 0
    const throttle = new RequestThrottle(0)
    throttle.wait = async () => {
      waits++
    }
    const fake = fakeBitJita()
    const client = new BitJitaClient({ fetch: fake.fetch, throttle })

    await client.player(PLAYER_ONE.entityId)
    await client.playerInventories(PLAYER_ONE.entityId)

    assert.equal(waits, 2)
  })

  test('the throttle starts at most one request every 500 ms', async ({ assert }) => {
    const sleeps: number[] = []
    const throttle = new RequestThrottle(
      500,
      () => 1_000,
      async (ms) => {
        sleeps.push(ms)
      }
    )

    await Promise.all([throttle.wait(), throttle.wait(), throttle.wait()])

    assert.deepEqual(sleeps, [500, 1000])
  })
})
