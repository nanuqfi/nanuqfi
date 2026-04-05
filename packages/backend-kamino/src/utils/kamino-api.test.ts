import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fetchUsdcReserveMetrics,
  fetchHistoricalMetrics,
  clearKaminoCache,
  KAMINO_MAIN_MARKET,
  KAMINO_USDC_RESERVE,
  type KaminoReserveMetrics,
} from './kamino-api'

const MOCK_RESERVE_RESPONSE = [
  {
    reserve: KAMINO_USDC_RESERVE,
    liquidityToken: 'USDC',
    liquidityTokenMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    maxLtv: '0.8',
    borrowApy: '0.038',
    supplyApy: '0.021',
    totalSupply: '209000000',
    totalBorrow: '155000000',
    totalBorrowUsd: '155000000',
    totalSupplyUsd: '209000000',
  },
]

const MOCK_HISTORY_RESPONSE = {
  reserve: KAMINO_USDC_RESERVE,
  history: [
    {
      timestamp: '2026-01-01T00:00:00.000Z',
      metrics: { supplyInterestAPY: 0.045, borrowInterestAPY: 0.065, depositTvl: '50000000', borrowTvl: '35000000' },
    },
    {
      timestamp: '2026-01-02T00:00:00.000Z',
      metrics: { supplyInterestAPY: 0.048, borrowInterestAPY: 0.068, depositTvl: '51000000', borrowTvl: '36000000' },
    },
  ],
}

describe('fetchUsdcReserveMetrics', () => {
  beforeEach(() => {
    clearKaminoCache()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches USDC reserve from Kamino API', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_RESERVE_RESPONSE),
    } as Response)

    const metrics = await fetchUsdcReserveMetrics()

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/kamino-market/')
    )
    expect(metrics.supplyApy).toBe(0.021)
    expect(metrics.borrowApy).toBe(0.038)
    expect(metrics.totalSupplyUsd).toBe(209000000)
    expect(metrics.totalBorrowUsd).toBe(155000000)
    expect(metrics.availableLiquidityUsd).toBe(54000000)
    expect(metrics.utilization).toBeCloseTo(0.7416, 3)
  })

  it('throws if USDC reserve not found', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ reserve: 'other', liquidityToken: 'SOL' }]),
    } as Response)

    await expect(fetchUsdcReserveMetrics()).rejects.toThrow('USDC reserve not found')
  })

  it('throws on non-OK response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response)

    await expect(fetchUsdcReserveMetrics()).rejects.toThrow('Kamino API error: 500')
  })

  it('caches result within TTL', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_RESERVE_RESPONSE),
    } as Response)

    await fetchUsdcReserveMetrics()
    await fetchUsdcReserveMetrics()

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('re-fetches after cache expires', async () => {
    vi.useFakeTimers()
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_RESERVE_RESPONSE),
    } as Response)

    await fetchUsdcReserveMetrics()
    vi.advanceTimersByTime(61_000)
    await fetchUsdcReserveMetrics()

    expect(fetch).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})

describe('fetchHistoricalMetrics', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches and parses historical data', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_HISTORY_RESPONSE),
    } as Response)

    const points = await fetchHistoricalMetrics()

    expect(points).toHaveLength(2)
    expect(points[0]).toEqual({
      timestamp: new Date('2026-01-01T00:00:00.000Z').getTime(),
      supplyApy: 0.045,
      borrowApy: 0.065,
      tvlUsd: 50000000,
    })
  })

  it('throws on API error', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response)

    await expect(fetchHistoricalMetrics()).rejects.toThrow('Kamino API error: 404')
  })
})
