import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchHistoricalData } from './data-loader'
import { DEFAULT_BACKTEST_CONFIG } from './types'

const MOCK_KAMINO_RESPONSE = {
  reserve: 'D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59',
  history: [
    { timestamp: '2024-01-01T00:00:00.000Z', metrics: { supplyInterestAPY: 0.05, borrowInterestAPY: 0.08, depositTvl: '50000000' } },
    { timestamp: '2024-01-02T00:00:00.000Z', metrics: { supplyInterestAPY: 0.06, borrowInterestAPY: 0.09, depositTvl: '51000000' } },
    { timestamp: '2024-01-03T00:00:00.000Z', metrics: { supplyInterestAPY: 0.04, borrowInterestAPY: 0.07, depositTvl: '49000000' } },
  ],
}

describe('fetchHistoricalData', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('fetches Kamino history and generates protocol estimates', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true, json: () => Promise.resolve(MOCK_KAMINO_RESPONSE),
    } as Response)

    const data = await fetchHistoricalData(DEFAULT_BACKTEST_CONFIG)
    expect(data).toHaveLength(3)
    expect(data[0]!.kaminoApy).toBe(0.05)
    expect(data[0]!.marginfiApy).toBeCloseTo(0.054, 3)
    expect(data[0]!.luloApy).toBeCloseTo(0.0567, 3)
  })

  it('filters out zero-APY entries', async () => {
    const responseWithZero = {
      ...MOCK_KAMINO_RESPONSE,
      history: [
        ...MOCK_KAMINO_RESPONSE.history,
        { timestamp: '2024-01-04T00:00:00.000Z', metrics: { supplyInterestAPY: 0, borrowInterestAPY: 0, depositTvl: '0' } },
      ],
    }
    vi.mocked(fetch).mockResolvedValue({
      ok: true, json: () => Promise.resolve(responseWithZero),
    } as Response)

    const data = await fetchHistoricalData(DEFAULT_BACKTEST_CONFIG)
    expect(data).toHaveLength(3)
  })

  it('throws on API error', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500, statusText: 'Error' } as Response)
    await expect(fetchHistoricalData(DEFAULT_BACKTEST_CONFIG)).rejects.toThrow('Kamino API error')
  })

  it('aggregates hourly data to daily averages', async () => {
    // 3 points on same day + 1 point on next day = 2 daily points
    const hourlyResponse = {
      reserve: 'D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59',
      history: [
        { timestamp: '2024-01-01T00:00:00.000Z', metrics: { supplyInterestAPY: 0.04, borrowInterestAPY: 0.06, depositTvl: '50000000' } },
        { timestamp: '2024-01-01T06:00:00.000Z', metrics: { supplyInterestAPY: 0.05, borrowInterestAPY: 0.07, depositTvl: '50000000' } },
        { timestamp: '2024-01-01T12:00:00.000Z', metrics: { supplyInterestAPY: 0.06, borrowInterestAPY: 0.08, depositTvl: '50000000' } },
        { timestamp: '2024-01-02T00:00:00.000Z', metrics: { supplyInterestAPY: 0.03, borrowInterestAPY: 0.05, depositTvl: '49000000' } },
      ],
    }
    vi.mocked(fetch).mockResolvedValue({
      ok: true, json: () => Promise.resolve(hourlyResponse),
    } as Response)

    const data = await fetchHistoricalData(DEFAULT_BACKTEST_CONFIG)
    expect(data).toHaveLength(2) // 2 days, not 4 hours
    // Day 1 average: (0.04 + 0.05 + 0.06) / 3 = 0.05
    expect(data[0]!.kaminoApy).toBeCloseTo(0.05, 4)
    // Day 2: single point 0.03
    expect(data[1]!.kaminoApy).toBe(0.03)
  })
})
