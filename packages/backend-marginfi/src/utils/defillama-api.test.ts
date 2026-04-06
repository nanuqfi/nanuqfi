import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fetchHistoricalRates,
  parseHistoricalResponse,
} from './defillama-api'

describe('parseHistoricalResponse', () => {
  it('parses DeFi Llama chart response into rate points', () => {
    const raw = {
      status: 'success',
      data: [
        { timestamp: '2026-01-01T00:00:00.000Z', tvlUsd: 50000000, apy: 6.5, apyBase: 6.5, apyReward: null },
        { timestamp: '2026-01-02T00:00:00.000Z', tvlUsd: 51000000, apy: 7.1, apyBase: 7.1, apyReward: null },
      ],
    }

    const points = parseHistoricalResponse(raw)
    expect(points).toHaveLength(2)
    expect(points[0]).toEqual({
      timestamp: new Date('2026-01-01T00:00:00.000Z').getTime(),
      apy: 0.065,
      tvlUsd: 50000000,
    })
    expect(points[1]).toEqual({
      timestamp: new Date('2026-01-02T00:00:00.000Z').getTime(),
      apy: 0.071,
      tvlUsd: 51000000,
    })
  })

  it('filters out entries with null/zero APY', () => {
    const raw = {
      status: 'success',
      data: [
        { timestamp: '2026-01-01T00:00:00.000Z', tvlUsd: 50000000, apy: 0, apyBase: 0, apyReward: null },
        { timestamp: '2026-01-02T00:00:00.000Z', tvlUsd: 51000000, apy: 6.5, apyBase: 6.5, apyReward: null },
      ],
    }

    const points = parseHistoricalResponse(raw)
    expect(points).toHaveLength(1)
    expect(points[0]!.apy).toBe(0.065)
  })

  it('returns empty array for empty response', () => {
    const raw = { status: 'success', data: [] }
    const points = parseHistoricalResponse(raw)
    expect(points).toHaveLength(0)
  })
})

describe('fetchHistoricalRates', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls DeFi Llama chart endpoint with pool ID', async () => {
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({
        status: 'success',
        data: [
          { timestamp: '2026-01-01T00:00:00.000Z', tvlUsd: 50000000, apy: 6.5, apyBase: 6.5, apyReward: null },
        ],
      }),
    }
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response)

    const points = await fetchHistoricalRates('test-pool-id')

    expect(fetch).toHaveBeenCalledWith('https://yields.llama.fi/chart/test-pool-id')
    expect(points).toHaveLength(1)
    expect(points[0]!.apy).toBe(0.065)
  })

  it('throws on non-OK response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response)

    await expect(fetchHistoricalRates('bad-id')).rejects.toThrow('DeFi Llama API error: 404 Not Found')
  })
})
