import { describe, it, expect, vi } from 'vitest'
import { MarginfiLendingBackend } from './lending'

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
