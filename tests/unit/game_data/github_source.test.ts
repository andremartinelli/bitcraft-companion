import { afterEach, describe, expect, test, vi } from 'vitest'
import { GitHubSource } from '@/services/game_data/source'

const commit = { sha: 'abc123', commit: { committer: { date: '2026-11-26T12:00:00Z' } } }

function stubFetch(response: Response) {
  const fetch = vi.fn(async () => response)
  vi.stubGlobal('fetch', fetch)
  return fetch
}

describe('the game data on GitHub', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  test("asks for the commit with the workflow's token, when there is one", async () => {
    vi.stubEnv('GITHUB_TOKEN', 'test-token')
    const fetch = stubFetch(Response.json(commit))

    expect((await new GitHubSource().describe()).commitSha).toBe('abc123')
    const headers = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers
    expect(headers).toMatchObject({ Authorization: 'Bearer test-token' })
  })

  test('without a token, no Authorization header', async () => {
    vi.stubEnv('GITHUB_TOKEN', '')
    const fetch = stubFetch(Response.json(commit))

    await new GitHubSource().describe()
    const headers = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers
    expect(headers).not.toHaveProperty('Authorization')
  })

  test("a refusal says GitHub's reason", async () => {
    stubFetch(Response.json({ message: 'API rate limit exceeded' }, { status: 403 }))

    await expect(new GitHubSource().describe()).rejects.toThrow(
      'GitHub respondeu 403 ao buscar o commit cereal/cs: API rate limit exceeded'
    )
  })
})
