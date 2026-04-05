import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MarginfiLendingBackend } from './lending'
import { clearRateCache } from '../utils/marginfi-data-api'

describe('MarginfiLendingBackend', () => {
  it('implements YieldBackend interface', () => {
    const backend = new MarginfiLendingBackend()
    expect(backend.name).toBe('marginfi-lending')
    expect(backend.capabilities).toBeDefined()
    expect(backend.capabilities.supportedAssets).toContain('USDC')
  })

  it('returns realistic mock yield', async () => {
    const backend = new MarginfiLendingBackend()
    const estimate = await backend.getExpectedYield()
    expect(estimate.annualizedApy).toBe(0.065)
    expect(estimate.source).toBe('marginfi-lending')
    expect(estimate.asset).toBe('USDC')
    expect(estimate.confidence).toBeGreaterThan(0)
    expect(estimate.metadata?.protocol).toBe('marginfi')
  })

  it('accepts custom APY override', async () => {
    const backend = new MarginfiLendingBackend({ mockApy: 0.12 })
    const estimate = await backend.getExpectedYield()
    expect(estimate.annualizedApy).toBe(0.12)
  })

  it('returns low-risk metrics for lending', async () => {
    const backend = new MarginfiLendingBackend()
    const risk = await backend.getRisk()
    expect(risk.liquidationRisk).toBe('none')
    expect(risk.volatilityScore).toBeLessThan(0.1)
    expect(risk.maxDrawdown).toBeLessThan(0.01)
  })

  it('estimates near-zero slippage', async () => {
    const backend = new MarginfiLendingBackend()
    const slippage = await backend.estimateSlippage(1_000_000n)
    expect(slippage).toBeLessThanOrEqual(5)
  })

  it('tracks deposit/withdraw state', async () => {
    const backend = new MarginfiLendingBackend()

    const posBefore = await backend.getPosition()
    expect(posBefore.isActive).toBe(false)
    expect(posBefore.depositedAmount).toBe(0n)

    const depositTx = await backend.deposit(100_000_000n) // 100 USDC
    expect(depositTx).toContain('marginfi-lending-deposit')

    const posAfter = await backend.getPosition()
    expect(posAfter.isActive).toBe(true)
    expect(posAfter.depositedAmount).toBe(100_000_000n)

    const withdrawTx = await backend.withdraw(100_000_000n)
    expect(withdrawTx).toContain('marginfi-lending-withdraw')

    const posFinal = await backend.getPosition()
    expect(posFinal.isActive).toBe(false)
    expect(posFinal.depositedAmount).toBe(0n)
  })

  it('registers with YieldBackendRegistry', async () => {
    // Import registry from core to prove cross-package compatibility
    const { YieldBackendRegistry } = await import('@nanuqfi/core')
    const registry = new YieldBackendRegistry()
    const backend = new MarginfiLendingBackend()

    registry.register(backend)
    const found = registry.get('marginfi-lending')
    expect(found).toBeDefined()
    expect(found!.name).toBe('marginfi-lending')
  })
})

describe('MarginfiLendingBackend — mock/real mode', () => {
  it('defaults to mock mode when no client provided', async () => {
    const backend = new MarginfiLendingBackend()
    const estimate = await backend.getExpectedYield()
    expect(estimate.metadata?.mode).toBe('mock')
  })

  it('defaults to mock mode when mockMode is explicitly true', async () => {
    const backend = new MarginfiLendingBackend({ mockMode: true })
    const estimate = await backend.getExpectedYield()
    expect(estimate.metadata?.mode).toBe('mock')
  })

  it('throws if real mode requested without client', () => {
    expect(() => new MarginfiLendingBackend({ mockMode: false }))
      .toThrow('MarginfiClient required for real mode')
  })

  it('accepts marginfiClient for real mode', () => {
    const mockClient = {
      getBankByTokenSymbol: vi.fn().mockReturnValue({
        computeInterestRates: () => ({ lendingRate: 0.07, borrowingRate: 0.09 }),
        computeUtilizationRate: () => 0.65,
        getTotalAssetQuantity: () => ({ toNumber: () => 50_000_000_000_000 }),
        getTotalLiabilityQuantity: () => ({ toNumber: () => 32_500_000_000_000 }),
      }),
    }
    const backend = new MarginfiLendingBackend({
      mockMode: false,
      marginfiClient: mockClient,
    })
    expect(backend.name).toBe('marginfi-lending')
  })
})

describe('MarginfiLendingBackend — real mode behavior', () => {
  function createMockClient(lendingRate = 0.07, utilization = 0.65) {
    return {
      getBankByTokenSymbol: vi.fn().mockReturnValue({
        computeInterestRates: () => ({ lendingRate, borrowingRate: 0.09 }),
        computeUtilizationRate: () => utilization,
        getTotalAssetQuantity: () => ({ toNumber: () => 50_000_000_000_000 }),
        getTotalLiabilityQuantity: () => ({ toNumber: () => 32_500_000_000_000 }),
      }),
    }
  }

  beforeEach(() => {
    clearRateCache()
  })

  it('getExpectedYield returns live rate from bank', async () => {
    const client = createMockClient(0.082)
    const backend = new MarginfiLendingBackend({ mockMode: false, marginfiClient: client })

    const estimate = await backend.getExpectedYield()
    expect(estimate.annualizedApy).toBe(0.082)
    expect(estimate.metadata?.mode).toBe('real')
    expect(estimate.confidence).toBe(0.92)
  })

  it('getRisk computes volatility from utilization', async () => {
    const client = createMockClient(0.07, 0.80)
    const backend = new MarginfiLendingBackend({ mockMode: false, marginfiClient: client })

    const risk = await backend.getRisk()
    // volatilityScore = 0.02 + 0.80 * 0.08 = 0.084
    expect(risk.volatilityScore).toBeCloseTo(0.084, 3)
    expect(risk.metadata?.utilization).toBe(0.80)
    expect(risk.liquidationRisk).toBe('none')
  })

  it('estimateSlippage scales with withdrawal size vs liquidity', async () => {
    const client = createMockClient()
    const backend = new MarginfiLendingBackend({ mockMode: false, marginfiClient: client })

    // Small withdrawal: 2 bps
    const small = await backend.estimateSlippage(100_000_000n) // 100 USDC
    expect(small).toBe(2)

    // Large withdrawal relative to liquidity: 10 bps
    const large = await backend.estimateSlippage(5_000_000_000_000n) // ~28% of available
    expect(large).toBe(10)
  })

  it('deposit returns allocator-cpi stub in real mode', async () => {
    const client = createMockClient()
    const backend = new MarginfiLendingBackend({ mockMode: false, marginfiClient: client })

    const tx = await backend.deposit(100_000_000n)
    expect(tx).toContain('pending-allocator-cpi')
  })
})
