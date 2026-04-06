/**
 * LuloLendingBackend — error path tests
 *
 * Mocks fetchWithRetry at the @nanuqfi/core module level (not global fetch),
 * matching how lulo-api.ts actually imports it. Covers:
 *   - Initialization (missing apiKey in real mode)
 *   - Network failures (ECONNREFUSED, abort/timeout, DNS)
 *   - Malformed API responses (missing regular/protected, missing totalLiquidity)
 *   - Rate limiting (retries exhausted propagates)
 *   - Cache SWR (fresh hit avoids second fetch)
 *   - API key forwarded in x-api-key header
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@nanuqfi/core', async () => {
  const actual = await vi.importActual<typeof import('@nanuqfi/core')>('@nanuqfi/core')
  return {
    ...actual,
    fetchWithRetry: vi.fn(),
  }
})

import { fetchWithRetry } from '@nanuqfi/core'
import { LuloLendingBackend } from './lending'
import { clearLuloCache } from '../utils/lulo-api'

const mockFetch = vi.mocked(fetchWithRetry)

/** Minimal valid Lulo rates response — values are PERCENTAGE (÷100 → decimal). */
function makeValidRatesResponse(): Response {
  return {
    ok: true,
    json: async () => ({
      regular: { CURRENT: 8.25, '24HR': 7.90 },
      protected: { CURRENT: 6.50, '24HR': 6.30 },
    }),
  } as Response
}

/** Minimal valid Lulo pool response — APY values are already decimal. */
function makeValidPoolResponse(): Response {
  return {
    ok: true,
    json: async () => ({
      regular: { type: 'regular', apy: 0.0825, maxWithdrawalAmount: 7_000_000, price: 1.1 },
      protected: { type: 'protected', apy: 0.065, openCapacity: 50_000_000, price: 1.06 },
      averagePoolRate: 0.07,
      totalLiquidity: 19_000_000,
      availableLiquidity: 18_500_000,
      regularLiquidityAmount: 9_000_000,
      protectedLiquidityAmount: 9_500_000,
      regularAvailableAmount: 9_000_000,
    }),
  } as Response
}

beforeEach(() => {
  clearLuloCache()
  mockFetch.mockReset()
})

// ---------------------------------------------------------------------------
// 1. Initialization
// ---------------------------------------------------------------------------

describe('LuloLendingBackend — initialization', () => {
  it('throws when constructed without apiKey in real mode', () => {
    expect(() => new LuloLendingBackend({ mockMode: false })).toThrow(
      'LULO_API_KEY required for real mode'
    )
  })

  it('throws with undefined apiKey explicitly', () => {
    expect(() => new LuloLendingBackend({ mockMode: false, apiKey: undefined })).toThrow(
      'LULO_API_KEY required for real mode'
    )
  })

  it('succeeds with apiKey provided in real mode', () => {
    expect(() => new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })).not.toThrow()
  })

  it('succeeds without any config (defaults to mock mode)', () => {
    expect(() => new LuloLendingBackend()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// 2. Network failures
// ---------------------------------------------------------------------------

describe('LuloLendingBackend — network failures', () => {
  it('propagates ECONNREFUSED on getExpectedYield (real mode)', async () => {
    const err = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), { code: 'ECONNREFUSED' })
    mockFetch.mockRejectedValue(err)

    const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })
    await expect(backend.getExpectedYield()).rejects.toThrow('ECONNREFUSED')
  })

  it('propagates abort/timeout error on getRisk (real mode)', async () => {
    const abortErr = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })
    mockFetch.mockRejectedValue(abortErr)

    const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })
    await expect(backend.getRisk()).rejects.toThrow(/aborted/i)
  })

  it('propagates DNS failure (ENOTFOUND) on estimateSlippage (real mode)', async () => {
    const err = Object.assign(new Error('getaddrinfo ENOTFOUND api.lulo.fi'), { code: 'ENOTFOUND' })
    mockFetch.mockRejectedValue(err)

    const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })
    await expect(backend.estimateSlippage(1_000_000n)).rejects.toThrow('ENOTFOUND')
  })

  it('mock mode is unaffected by network failures', async () => {
    mockFetch.mockRejectedValue(new Error('should not be called'))

    const backend = new LuloLendingBackend({ mockMode: true })
    const estimate = await backend.getExpectedYield()
    expect(estimate.annualizedApy).toBe(0.07)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 3. Malformed API responses
// ---------------------------------------------------------------------------

describe('LuloLendingBackend — malformed API responses', () => {
  it('throws when rates response is missing the `regular` field', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        // regular is absent — only protected present
        protected: { CURRENT: 6.50, '24HR': 6.30 },
      }),
    } as Response)

    const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })
    await expect(backend.getExpectedYield()).rejects.toThrow(/invalid rates response shape/i)
  })

  it('throws when rates response is missing the `protected` field', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        regular: { CURRENT: 8.25, '24HR': 7.90 },
        // protected is absent
      }),
    } as Response)

    const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })
    await expect(backend.getExpectedYield()).rejects.toThrow(/invalid rates response shape/i)
  })

  it('throws when rates response is null', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => null,
    } as Response)

    const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })
    await expect(backend.getExpectedYield()).rejects.toThrow(/invalid rates response shape/i)
  })

  it('throws when rates response is a plain array (not an object with regular/protected)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ unexpected: true }],
    } as Response)

    const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })
    await expect(backend.getExpectedYield()).rejects.toThrow(/invalid rates response shape/i)
  })

  it('throws when pool response is missing `totalLiquidity`', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        // totalLiquidity absent — everything else present
        regular: { type: 'regular', apy: 0.0825, maxWithdrawalAmount: 7_000_000, price: 1.1 },
        protected: { type: 'protected', apy: 0.065, openCapacity: 50_000_000, price: 1.06 },
        averagePoolRate: 0.07,
        availableLiquidity: 18_500_000,
      }),
    } as Response)

    const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })
    await expect(backend.getRisk()).rejects.toThrow(/invalid pool response shape/i)
  })

  it('throws when pool response has `totalLiquidity` as a string (not number)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        regular: { type: 'regular', apy: 0.0825, maxWithdrawalAmount: 7_000_000, price: 1.1 },
        protected: { type: 'protected', apy: 0.065, openCapacity: 50_000_000, price: 1.06 },
        averagePoolRate: 0.07,
        totalLiquidity: '19000000',  // string — type guard rejects
        availableLiquidity: 18_500_000,
      }),
    } as Response)

    const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })
    await expect(backend.getRisk()).rejects.toThrow(/invalid pool response shape/i)
  })

  it('throws when pool response is null', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => null,
    } as Response)

    const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })
    await expect(backend.getRisk()).rejects.toThrow(/invalid pool response shape/i)
  })
})

// ---------------------------------------------------------------------------
// 4. Rate limiting — retries exhausted
// ---------------------------------------------------------------------------

describe('LuloLendingBackend — rate limiting', () => {
  it('propagates exhausted-retries error on getExpectedYield', async () => {
    mockFetch.mockRejectedValue(new Error('fetchWithRetry: all retries exhausted'))

    const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })
    await expect(backend.getExpectedYield()).rejects.toThrow('fetchWithRetry: all retries exhausted')
  })

  it('propagates exhausted-retries error on getRisk', async () => {
    mockFetch.mockRejectedValue(new Error('fetchWithRetry: all retries exhausted'))

    const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })
    await expect(backend.getRisk()).rejects.toThrow('fetchWithRetry: all retries exhausted')
  })

  it('propagates 5xx server error as an HTTP error', async () => {
    mockFetch.mockRejectedValue(new Error('HTTP 500'))

    const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })
    await expect(backend.getExpectedYield()).rejects.toThrow('HTTP 500')
  })
})

// ---------------------------------------------------------------------------
// 5. Cache SWR — fresh hit avoids re-fetch
// ---------------------------------------------------------------------------

describe('LuloLendingBackend — cache SWR', () => {
  it('populates rates cache on first call and uses it on second (mockFetch called once)', async () => {
    mockFetch.mockResolvedValue(makeValidRatesResponse())

    const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })

    const first = await backend.getExpectedYield()
    const second = await backend.getExpectedYield()

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(first.annualizedApy).toBe(second.annualizedApy)
    // 8.25% → 0.0825
    expect(first.annualizedApy).toBeCloseTo(0.0825, 4)
  })

  it('uses stale rates cache when fetch fails after TTL expires', async () => {
    vi.useFakeTimers()

    // Populate fresh cache
    mockFetch.mockResolvedValueOnce(makeValidRatesResponse())
    const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })
    await backend.getExpectedYield()

    // Advance past TTL (60s) into stale window (60–120s)
    vi.advanceTimersByTime(61_000)

    // Re-fetch fails → SWR returns stale value
    mockFetch.mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
    const staleResult = await backend.getExpectedYield()

    expect(staleResult.annualizedApy).toBeCloseTo(0.0825, 4)
    expect(mockFetch).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })

  it('clears cache and re-fetches after clearLuloCache()', async () => {
    mockFetch.mockResolvedValue(makeValidRatesResponse())

    const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })
    await backend.getExpectedYield()

    clearLuloCache()
    await backend.getExpectedYield()

    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('populates pool cache on first getRisk and reuses on second call (mockFetch called once)', async () => {
    mockFetch.mockResolvedValue(makeValidPoolResponse())

    const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })

    const first = await backend.getRisk()
    const second = await backend.getRisk()

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(first.volatilityScore).toBe(second.volatilityScore)
  })
})

// ---------------------------------------------------------------------------
// 6. API key forwarded in x-api-key header
// ---------------------------------------------------------------------------

describe('LuloLendingBackend — API key usage', () => {
  it('passes x-api-key header in rates fetch call', async () => {
    mockFetch.mockResolvedValue(makeValidRatesResponse())

    const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'my-secret-key' })
    await backend.getExpectedYield()

    expect(mockFetch).toHaveBeenCalledOnce()
    const [_url, options] = mockFetch.mock.calls[0]
    expect((options?.headers as Record<string, string>)?.['x-api-key']).toBe('my-secret-key')
  })

  it('passes x-api-key header in pool fetch call', async () => {
    mockFetch.mockResolvedValue(makeValidPoolResponse())

    const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'my-secret-key' })
    await backend.getRisk()

    expect(mockFetch).toHaveBeenCalledOnce()
    const [_url, options] = mockFetch.mock.calls[0]
    expect((options?.headers as Record<string, string>)?.['x-api-key']).toBe('my-secret-key')
  })

  it('calls the correct rates endpoint URL', async () => {
    mockFetch.mockResolvedValue(makeValidRatesResponse())

    const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })
    await backend.getExpectedYield()

    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('/v1/rates.getRates')
  })

  it('calls the correct pool endpoint URL', async () => {
    mockFetch.mockResolvedValue(makeValidPoolResponse())

    const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })
    await backend.getRisk()

    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('/v1/pool.getPools')
  })

  it('uses custom apiBaseUrl when provided', async () => {
    mockFetch.mockResolvedValue(makeValidRatesResponse())

    const backend = new LuloLendingBackend({
      mockMode: false,
      apiKey: 'test-key',
      apiBaseUrl: 'https://staging.lulo.fi',
    })
    await backend.getExpectedYield()

    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('staging.lulo.fi')
  })
})
