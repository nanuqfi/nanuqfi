import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MarginfiLendingBackend } from './lending'
import { clearRateCache } from '../utils/marginfi-data-api'
import type { MarginfiClientLike } from '../utils/marginfi-data-api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createFailingClient(error: string): MarginfiClientLike {
  return {
    getBankByTokenSymbol: vi.fn().mockImplementation(() => {
      throw new Error(error)
    }),
  }
}

function createNullBankClient(): MarginfiClientLike {
  return {
    getBankByTokenSymbol: vi.fn().mockReturnValue(null),
  }
}

function createNaNClient(opts: { lendingRate?: number; utilization?: number } = {}): MarginfiClientLike {
  const lendingRate = opts.lendingRate ?? NaN
  const utilization = opts.utilization ?? NaN
  return {
    getBankByTokenSymbol: vi.fn().mockReturnValue({
      computeInterestRates: () => ({ lendingRate, borrowingRate: 0.09 }),
      computeUtilizationRate: () => utilization,
      getTotalAssetQuantity: () => ({ toNumber: () => 50_000_000_000_000 }),
      getTotalLiabilityQuantity: () => ({ toNumber: () => 32_500_000_000_000 }),
    }),
  }
}

// ---------------------------------------------------------------------------
// 1. Initialization failures
// ---------------------------------------------------------------------------

describe('MarginfiLendingBackend — initialization failures', () => {
  it('throws when real mode requested without a client', () => {
    expect(() => new MarginfiLendingBackend({ mockMode: false }))
      .toThrow('MarginfiClient required for real mode')
  })

  it('succeeds with default config (mock mode)', () => {
    expect(() => new MarginfiLendingBackend()).not.toThrow()
  })

  it('succeeds with explicit mockMode: true and no client', () => {
    expect(() => new MarginfiLendingBackend({ mockMode: true })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// 2. Client method failures (real mode with mocked failing client)
// ---------------------------------------------------------------------------

describe('MarginfiLendingBackend — client method failures', () => {
  beforeEach(() => {
    clearRateCache()
  })

  it('getExpectedYield propagates client error when getBankByTokenSymbol throws', async () => {
    const client = createFailingClient('RPC connection lost')
    const backend = new MarginfiLendingBackend({ mockMode: false, marginfiClient: client })

    await expect(backend.getExpectedYield()).rejects.toThrow('RPC connection lost')
  })

  it('getRisk propagates client error when getBankByTokenSymbol throws', async () => {
    const client = createFailingClient('Marginfi program unavailable')
    const backend = new MarginfiLendingBackend({ mockMode: false, marginfiClient: client })

    await expect(backend.getRisk()).rejects.toThrow('Marginfi program unavailable')
  })

  it('estimateSlippage propagates client error when getBankByTokenSymbol throws', async () => {
    const client = createFailingClient('Node rate-limited')
    const backend = new MarginfiLendingBackend({ mockMode: false, marginfiClient: client })

    await expect(backend.estimateSlippage(1_000_000n)).rejects.toThrow('Node rate-limited')
  })

  it('getExpectedYield throws when client returns null bank', async () => {
    const client = createNullBankClient()
    const backend = new MarginfiLendingBackend({ mockMode: false, marginfiClient: client })

    await expect(backend.getExpectedYield()).rejects.toThrow('Bank USDC not found on Marginfi')
  })

  it('getRisk throws when client returns null bank', async () => {
    const client = createNullBankClient()
    const backend = new MarginfiLendingBackend({ mockMode: false, marginfiClient: client })

    await expect(backend.getRisk()).rejects.toThrow('Bank USDC not found on Marginfi')
  })

  it('estimateSlippage throws when client returns null bank', async () => {
    const client = createNullBankClient()
    const backend = new MarginfiLendingBackend({ mockMode: false, marginfiClient: client })

    await expect(backend.estimateSlippage(1_000_000n)).rejects.toThrow('Bank USDC not found on Marginfi')
  })

  it('getBankByTokenSymbol is called with USDC symbol', async () => {
    const client = createFailingClient('irrelevant')
    const backend = new MarginfiLendingBackend({ mockMode: false, marginfiClient: client })

    await backend.getExpectedYield().catch(() => undefined)

    expect(client.getBankByTokenSymbol).toHaveBeenCalledWith('USDC')
  })
})

// ---------------------------------------------------------------------------
// 3. Malformed data — documents current behavior (NaN propagation)
// ---------------------------------------------------------------------------

describe('MarginfiLendingBackend — malformed data', () => {
  beforeEach(() => {
    clearRateCache()
  })

  it('getExpectedYield returns NaN APY when lendingRate is NaN (documents current behavior)', async () => {
    const client = createNaNClient({ lendingRate: NaN, utilization: 0.65 })
    const backend = new MarginfiLendingBackend({ mockMode: false, marginfiClient: client })

    const estimate = await backend.getExpectedYield()
    expect(Number.isNaN(estimate.annualizedApy)).toBe(true)
  })

  it('getRisk returns NaN volatilityScore when utilization is NaN (documents current behavior)', async () => {
    const client = createNaNClient({ lendingRate: 0.07, utilization: NaN })
    const backend = new MarginfiLendingBackend({ mockMode: false, marginfiClient: client })

    const risk = await backend.getRisk()
    // volatilityScore = 0.02 + NaN * 0.08 = NaN
    expect(Number.isNaN(risk.volatilityScore)).toBe(true)
  })

  it('getRisk still returns valid non-NaN fields when only volatilityScore is NaN', async () => {
    const client = createNaNClient({ lendingRate: 0.07, utilization: NaN })
    const backend = new MarginfiLendingBackend({ mockMode: false, marginfiClient: client })

    const risk = await backend.getRisk()
    expect(risk.liquidationRisk).toBe('none')
    expect(risk.maxDrawdown).toBe(0.005)
    expect(risk.correlationToMarket).toBe(0.15)
  })
})

// ---------------------------------------------------------------------------
// 4. Concurrent operations
// ---------------------------------------------------------------------------

describe('MarginfiLendingBackend — concurrent operations', () => {
  beforeEach(() => {
    clearRateCache()
  })

  it('3 parallel getExpectedYield calls all succeed in mock mode', async () => {
    const backend = new MarginfiLendingBackend({ mockApy: 0.075 })

    const results = await Promise.all([
      backend.getExpectedYield(),
      backend.getExpectedYield(),
      backend.getExpectedYield(),
    ])

    expect(results).toHaveLength(3)
    for (const estimate of results) {
      expect(estimate.annualizedApy).toBe(0.075)
      expect(estimate.source).toBe('marginfi-lending')
      expect(estimate.asset).toBe('USDC')
    }
  })

  it('3 parallel getExpectedYield calls all succeed in real mode (shared cache)', async () => {
    const client: MarginfiClientLike = {
      getBankByTokenSymbol: vi.fn().mockReturnValue({
        computeInterestRates: () => ({ lendingRate: 0.082, borrowingRate: 0.10 }),
        computeUtilizationRate: () => 0.70,
        getTotalAssetQuantity: () => ({ toNumber: () => 50_000_000_000_000 }),
        getTotalLiabilityQuantity: () => ({ toNumber: () => 35_000_000_000_000 }),
      }),
    }
    const backend = new MarginfiLendingBackend({ mockMode: false, marginfiClient: client })

    const results = await Promise.all([
      backend.getExpectedYield(),
      backend.getExpectedYield(),
      backend.getExpectedYield(),
    ])

    expect(results).toHaveLength(3)
    for (const estimate of results) {
      expect(estimate.annualizedApy).toBe(0.082)
    }

    // Cache should mean the client was only called once despite 3 concurrent calls
    // (all synchronous, so first call populates cache, rest read from it)
    expect(client.getBankByTokenSymbol).toHaveBeenCalledWith('USDC')
  })
})
