import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchWithRetry } from './fetch-retry'

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns response on first successful attempt', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response)

    const res = await fetchWithRetry('https://example.com/api')

    expect(res.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('retries on 500 and succeeds', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response)

    const res = await fetchWithRetry('https://example.com/api', { retries: 2, baseDelay: 1 })

    expect(res.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('retries on 429 (rate limit) and succeeds', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: false, status: 429 } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response)

    const res = await fetchWithRetry('https://example.com/api', { retries: 2, baseDelay: 1 })

    expect(res.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('throws immediately on 4xx without retrying', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as Response)

    await expect(
      fetchWithRetry('https://example.com/api', { retries: 3, baseDelay: 1 })
    ).rejects.toThrow('HTTP 404')

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('throws after exhausting all retries', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response)

    await expect(
      fetchWithRetry('https://example.com/api', { retries: 2, baseDelay: 1 })
    ).rejects.toThrow('fetchWithRetry: all retries exhausted')

    expect(fetch).toHaveBeenCalledTimes(3) // initial + 2 retries
  })
})
