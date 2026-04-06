/**
 * KaminoLendingBackend — error path tests
 *
 * Mocks fetchWithRetry at the @nanuqfi/core module level (not global fetch),
 * matching how kamino-api.ts actually imports it. Covers:
 *   - Network failures (ECONNREFUSED, abort/timeout, DNS)
 *   - Malformed API responses (non-array, missing USDC, NaN fields)
 *   - Rate limiting (429 retries exhausted)
 *   - Cache SWR (fresh hit avoids second fetch)
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
import { KaminoLendingBackend } from './lending'
import { clearKaminoCache } from '../utils/kamino-api'

const mockFetch = vi.mocked(fetchWithRetry)

/** Minimal valid Kamino response with a USDC reserve. */
function makeValidResponse(overrides: Record<string, string> = {}): Response {
  return {
    ok: true,
    json: async () => [
      {
        reserve: 'test',
        liquidityToken: 'USDC',
        supplyApy: '0.05',
        borrowApy: '0.08',
        totalSupplyUsd: '200000000',
        totalBorrowUsd: '100000000',
        ...overrides,
      },
    ],
  } as Response
}

beforeEach(() => {
  clearKaminoCache()
  mockFetch.mockReset()
})

// ---------------------------------------------------------------------------
// 1. Network failures
// ---------------------------------------------------------------------------

describe('KaminoLendingBackend — network failures', () => {
  it('propagates ECONNREFUSED on getExpectedYield (real mode)', async () => {
    const err = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), { code: 'ECONNREFUSED' })
    mockFetch.mockRejectedValue(err)

    const backend = new KaminoLendingBackend({ mockMode: false })
    await expect(backend.getExpectedYield()).rejects.toThrow('ECONNREFUSED')
  })

  it('propagates abort/timeout error on getRisk (real mode)', async () => {
    const abortErr = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })
    mockFetch.mockRejectedValue(abortErr)

    const backend = new KaminoLendingBackend({ mockMode: false })
    await expect(backend.getRisk()).rejects.toThrow(/aborted/i)
  })

  it('propagates DNS failure (ENOTFOUND) on estimateSlippage (real mode)', async () => {
    const err = Object.assign(new Error('getaddrinfo ENOTFOUND api.kamino.finance'), { code: 'ENOTFOUND' })
    mockFetch.mockRejectedValue(err)

    const backend = new KaminoLendingBackend({ mockMode: false })
    await expect(backend.estimateSlippage(1_000_000n)).rejects.toThrow('ENOTFOUND')
  })

  it('mock mode is unaffected by network failures', async () => {
    // mockFetch never called in mock mode — errors are irrelevant
    mockFetch.mockRejectedValue(new Error('should not be called'))

    const backend = new KaminoLendingBackend({ mockMode: true })
    const estimate = await backend.getExpectedYield()
    expect(estimate.annualizedApy).toBe(0.045)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 2. Malformed API responses
// ---------------------------------------------------------------------------

describe('KaminoLendingBackend — malformed API responses', () => {
  it('throws when API returns a non-array (object)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'unexpected' }),
    } as Response)

    const backend = new KaminoLendingBackend({ mockMode: false })
    await expect(backend.getExpectedYield()).rejects.toThrow(/expected array/i)
  })

  it('throws when API returns a non-array (null)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => null,
    } as Response)

    const backend = new KaminoLendingBackend({ mockMode: false })
    await expect(backend.getExpectedYield()).rejects.toThrow(/expected array/i)
  })

  it('throws when USDC reserve is absent from response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { reserve: 'other', liquidityToken: 'SOL', supplyApy: '0.01', borrowApy: '0.02', totalSupplyUsd: '1000', totalBorrowUsd: '500' },
      ],
    } as Response)

    const backend = new KaminoLendingBackend({ mockMode: false })
    await expect(backend.getExpectedYield()).rejects.toThrow(/USDC reserve not found/i)
  })

  it('returns NaN APY when supplyApy field is unparseable', async () => {
    // The implementation does Number(usdc.supplyApy) — no guard, NaN propagates.
    // This test documents the behavior and serves as a regression marker.
    mockFetch.mockResolvedValue(makeValidResponse({ supplyApy: 'not-a-number' }))

    const backend = new KaminoLendingBackend({ mockMode: false })
    const estimate = await backend.getExpectedYield()
    expect(Number.isNaN(estimate.annualizedApy)).toBe(true)
  })

  it('treats unparseable totalSupplyUsd as zero utilization (NaN > 0 is false)', async () => {
    // Number('bad') = NaN, NaN > 0 = false → utilization = 0
    // volatilityScore = 0.02 + 0 * 0.08 = 0.02
    mockFetch.mockResolvedValue(makeValidResponse({ totalSupplyUsd: 'bad', totalBorrowUsd: '100000000' }))

    const backend = new KaminoLendingBackend({ mockMode: false })
    const risk = await backend.getRisk()
    expect(risk.volatilityScore).toBeCloseTo(0.02)
    expect(risk.metadata?.utilization).toBe(0)
  })

  it('handles empty array response (no reserves at all)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response)

    const backend = new KaminoLendingBackend({ mockMode: false })
    await expect(backend.getExpectedYield()).rejects.toThrow(/USDC reserve not found/i)
  })
})

// ---------------------------------------------------------------------------
// 3. Rate limiting — retries exhausted
// ---------------------------------------------------------------------------

describe('KaminoLendingBackend — rate limiting', () => {
  it('propagates exhausted-retries error on 429 (getExpectedYield)', async () => {
    // fetchWithRetry handles 429 internally; after exhausting retries it throws this.
    mockFetch.mockRejectedValue(new Error('fetchWithRetry: all retries exhausted'))

    const backend = new KaminoLendingBackend({ mockMode: false })
    await expect(backend.getExpectedYield()).rejects.toThrow('fetchWithRetry: all retries exhausted')
  })

  it('propagates exhausted-retries error on 429 (getRisk)', async () => {
    mockFetch.mockRejectedValue(new Error('fetchWithRetry: all retries exhausted'))

    const backend = new KaminoLendingBackend({ mockMode: false })
    await expect(backend.getRisk()).rejects.toThrow('fetchWithRetry: all retries exhausted')
  })

  it('propagates 5xx server error (500) as an HTTP error', async () => {
    mockFetch.mockRejectedValue(new Error('HTTP 500'))

    const backend = new KaminoLendingBackend({ mockMode: false })
    await expect(backend.getExpectedYield()).rejects.toThrow('HTTP 500')
  })
})

// ---------------------------------------------------------------------------
// 4. Cache SWR — fresh hit avoids re-fetch
// ---------------------------------------------------------------------------

describe('KaminoLendingBackend — cache SWR', () => {
  it('populates cache on first call and uses it on second (mockFetch called once)', async () => {
    mockFetch.mockResolvedValue(makeValidResponse())

    const backend = new KaminoLendingBackend({ mockMode: false })

    const first = await backend.getExpectedYield()
    const second = await backend.getExpectedYield()

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(first.annualizedApy).toBe(second.annualizedApy)
  })

  it('uses stale cache when fetch fails after TTL expires', async () => {
    vi.useFakeTimers()

    // Populate fresh cache
    mockFetch.mockResolvedValueOnce(makeValidResponse())
    const backend = new KaminoLendingBackend({ mockMode: false })
    await backend.getExpectedYield()

    // Advance past TTL (60s) into stale window (60–120s)
    vi.advanceTimersByTime(61_000)

    // Next call triggers re-fetch attempt → fails → SWR returns stale value
    mockFetch.mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
    const staleResult = await backend.getExpectedYield()

    expect(staleResult.annualizedApy).toBe(0.05)  // from the initial valid response
    expect(mockFetch).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })

  it('clears cache and re-fetches after clearKaminoCache()', async () => {
    mockFetch.mockResolvedValue(makeValidResponse())

    const backend = new KaminoLendingBackend({ mockMode: false })
    await backend.getExpectedYield()

    clearKaminoCache()
    await backend.getExpectedYield()

    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})
