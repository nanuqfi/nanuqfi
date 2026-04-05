import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchLendingRate,
  fetchBankMetrics,
  clearRateCache,
  type MarginfiBank,
} from './marginfi-data-api'

// Minimal mock matching the Marginfi Bank interface methods we use
function createMockBank(overrides?: Partial<MarginfiBank>): MarginfiBank {
  return {
    tokenSymbol: 'USDC',
    mint: { toBase58: () => 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
    mintDecimals: 6,
    computeInterestRates: () => ({
      lendingRate: 0.065,
      borrowingRate: 0.085,
    }),
    computeUtilizationRate: () => 0.72,
    getTotalAssetQuantity: () => ({ toNumber: () => 50_000_000_000_000 }),
    getTotalLiabilityQuantity: () => ({ toNumber: () => 36_000_000_000_000 }),
    ...overrides,
  }
}

// Minimal mock matching MarginfiClient.getBankByTokenSymbol
function createMockClient(bank: MarginfiBank | null = createMockBank()) {
  return {
    getBankByTokenSymbol: vi.fn().mockReturnValue(bank),
  }
}

describe('fetchLendingRate', () => {
  beforeEach(() => {
    clearRateCache()
  })

  it('returns lending rate from bank', () => {
    const client = createMockClient()
    const rate = fetchLendingRate(client, 'USDC')
    expect(rate).toBe(0.065)
  })

  it('throws if bank not found', () => {
    const client = createMockClient(null)
    expect(() => fetchLendingRate(client, 'FAKE')).toThrow('Bank FAKE not found')
  })

  it('caches result for same token within TTL', () => {
    const client = createMockClient()
    fetchLendingRate(client, 'USDC')
    fetchLendingRate(client, 'USDC')
    expect(client.getBankByTokenSymbol).toHaveBeenCalledTimes(1)
  })

  it('re-fetches after cache expires', () => {
    vi.useFakeTimers()
    const client = createMockClient()

    fetchLendingRate(client, 'USDC')
    vi.advanceTimersByTime(61_000) // 61 seconds > 60s TTL
    fetchLendingRate(client, 'USDC')

    expect(client.getBankByTokenSymbol).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})

describe('fetchBankMetrics', () => {
  beforeEach(() => {
    clearRateCache()
  })

  it('returns utilization, assets, liabilities, tvl', () => {
    const client = createMockClient()
    const metrics = fetchBankMetrics(client, 'USDC')

    expect(metrics.utilization).toBe(0.72)
    expect(metrics.totalAssets).toBe(50_000_000_000_000)
    expect(metrics.totalLiabilities).toBe(36_000_000_000_000)
    expect(metrics.availableLiquidity).toBe(14_000_000_000_000)
  })

  it('throws if bank not found', () => {
    const client = createMockClient(null)
    expect(() => fetchBankMetrics(client, 'FAKE')).toThrow('Bank FAKE not found')
  })
})
