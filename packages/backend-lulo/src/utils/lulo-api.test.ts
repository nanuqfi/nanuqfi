import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fetchLuloRates,
  fetchLuloPoolData,
  clearLuloCache,
} from './lulo-api'

// Rates API returns percentages — must be divided by 100
const MOCK_RATES_RESPONSE = {
  regular: {
    CURRENT: 8.25,
    '1HR': 7.19,
    '24HR': 6.86,
    '7DAY': 8.26,
    '30DAY': 6.57,
    '1YR': 6.70,
  },
  protected: {
    CURRENT: 4.86,
    '1HR': 4.23,
    '24HR': 4.04,
    '7DAY': 5.07,
    '30DAY': 4.15,
    '1YR': 4.32,
  },
}

// Pool data already decimal — no conversion needed
const MOCK_POOL_RESPONSE = {
  regular: { type: 'regular', apy: 0.082539, maxWithdrawalAmount: 7774239.82, price: 1.103387 },
  protected: { type: 'protected', apy: 0.048582, openCapacity: 54986431.48, price: 1.061395 },
  averagePoolRate: 0.07015,
  totalLiquidity: 19355811.43,
  availableLiquidity: 18890311.35,
  regularLiquidityAmount: 9459256.23,
  protectedLiquidityAmount: 9880952.47,
  regularAvailableAmount: 9009358.88,
}

const TEST_API_KEY = 'test-key-abc123'

describe('fetchLuloRates', () => {
  beforeEach(() => {
    clearLuloCache()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches rates from Lulo API with correct auth header', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_RATES_RESPONSE),
    } as Response)

    await fetchLuloRates(TEST_API_KEY)

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/rates.getRates'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': TEST_API_KEY }),
      })
    )
  })

  it('converts rate percentages to decimals', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_RATES_RESPONSE),
    } as Response)

    const rates = await fetchLuloRates(TEST_API_KEY)

    // 8.25% → 0.0825
    expect(rates.regularApy).toBeCloseTo(0.0825, 4)
    // 4.86% → 0.0486
    expect(rates.protectedApy).toBeCloseTo(0.0486, 4)
    // 6.86% → 0.0686
    expect(rates.regular24hApy).toBeCloseTo(0.0686, 4)
    // 4.04% → 0.0404
    expect(rates.protected24hApy).toBeCloseTo(0.0404, 4)
  })

  it('caches result within TTL', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_RATES_RESPONSE),
    } as Response)

    await fetchLuloRates(TEST_API_KEY)
    await fetchLuloRates(TEST_API_KEY)

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('re-fetches after cache expires', async () => {
    vi.useFakeTimers()
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_RATES_RESPONSE),
    } as Response)

    await fetchLuloRates(TEST_API_KEY)
    vi.advanceTimersByTime(61_000)
    await fetchLuloRates(TEST_API_KEY)

    expect(fetch).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('throws on non-OK response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as Response)

    await expect(fetchLuloRates(TEST_API_KEY)).rejects.toThrow('Lulo API error: 401')
  })
})

describe('fetchLuloPoolData', () => {
  beforeEach(() => {
    clearLuloCache()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches pool data from Lulo API with correct auth header', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_POOL_RESPONSE),
    } as Response)

    await fetchLuloPoolData(TEST_API_KEY)

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/pool.getPools'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': TEST_API_KEY }),
      })
    )
  })

  it('parses pool data without conversion (already decimal)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_POOL_RESPONSE),
    } as Response)

    const pool = await fetchLuloPoolData(TEST_API_KEY)

    // APYs already decimal — no conversion
    expect(pool.regularApy).toBeCloseTo(0.082539, 5)
    expect(pool.protectedApy).toBeCloseTo(0.048582, 5)
    expect(pool.averagePoolRate).toBeCloseTo(0.07015, 5)
    expect(pool.totalLiquidity).toBeCloseTo(19355811.43, 1)
    expect(pool.availableLiquidity).toBeCloseTo(18890311.35, 1)
  })

  it('caches pool data within TTL', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_POOL_RESPONSE),
    } as Response)

    await fetchLuloPoolData(TEST_API_KEY)
    await fetchLuloPoolData(TEST_API_KEY)

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('throws on non-OK response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    } as Response)

    await expect(fetchLuloPoolData(TEST_API_KEY)).rejects.toThrow('Lulo API error: 503')
  })
})

describe('clearLuloCache', () => {
  it('forces re-fetch after clearing', async () => {
    vi.stubGlobal('fetch', vi.fn())
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_RATES_RESPONSE),
    } as Response)

    await fetchLuloRates(TEST_API_KEY)
    clearLuloCache()
    await fetchLuloRates(TEST_API_KEY)

    expect(fetch).toHaveBeenCalledTimes(2)
    vi.unstubAllGlobals()
  })
})
