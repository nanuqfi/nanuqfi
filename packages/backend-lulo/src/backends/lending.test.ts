import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LuloLendingBackend } from './lending'
import { clearLuloCache } from '../utils/lulo-api'

// Simulated Lulo rates response (percentage — client converts to decimal)
const MOCK_RATES_RESPONSE = {
  regular: { CURRENT: 8.25, '1HR': 7.19, '24HR': 6.86, '7DAY': 8.26, '30DAY': 6.57, '1YR': 6.70 },
  protected: { CURRENT: 4.86, '1HR': 4.23, '24HR': 4.04, '7DAY': 5.07, '30DAY': 4.15, '1YR': 4.32 },
}

// Simulated pool data (APY already decimal)
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

// ─── Mock mode ────────────────────────────────────────────────────────────────

describe('LuloLendingBackend — mock mode', () => {
  it('implements YieldBackend interface', () => {
    const backend = new LuloLendingBackend()
    expect(backend.name).toBe('lulo-lending')
    expect(backend.capabilities.supportedAssets).toContain('USDC')
    expect(backend.capabilities.liquidationRisk).toBe('none')
    expect(backend.capabilities.features).toContain('lulo-aggregator')
  })

  it('returns default mock yield (7%)', async () => {
    const backend = new LuloLendingBackend()
    const estimate = await backend.getExpectedYield()
    expect(estimate.annualizedApy).toBe(0.07)
    expect(estimate.metadata?.mode).toBe('mock')
    expect(estimate.metadata?.protocol).toBe('lulo')
    expect(estimate.asset).toBe('USDC')
    expect(estimate.source).toBe('lulo-lending')
  })

  it('accepts custom APY override', async () => {
    const backend = new LuloLendingBackend({ mockApy: 0.09 })
    const estimate = await backend.getExpectedYield()
    expect(estimate.annualizedApy).toBe(0.09)
  })

  it('returns low-risk metrics with none liquidation risk', async () => {
    const backend = new LuloLendingBackend()
    const risk = await backend.getRisk()
    expect(risk.liquidationRisk).toBe('none')
    expect(risk.volatilityScore).toBeLessThan(0.1)
    expect(risk.maxDrawdown).toBeGreaterThan(0)
    expect(risk.metadata?.mode).toBe('mock')
    expect(risk.metadata?.protocol).toBe('lulo')
  })

  it('estimates near-zero slippage (1 bps) in mock mode', async () => {
    const backend = new LuloLendingBackend()
    const slippage = await backend.estimateSlippage(1_000_000n)
    expect(slippage).toBe(1)
  })

  it('tracks deposit/withdraw state correctly', async () => {
    const backend = new LuloLendingBackend()

    const initial = await backend.getPosition()
    expect(initial.isActive).toBe(false)
    expect(initial.depositedAmount).toBe(0n)

    await backend.deposit(200_000_000n)
    const afterDeposit = await backend.getPosition()
    expect(afterDeposit.isActive).toBe(true)
    expect(afterDeposit.depositedAmount).toBe(200_000_000n)

    await backend.withdraw(200_000_000n)
    const afterWithdraw = await backend.getPosition()
    expect(afterWithdraw.isActive).toBe(false)
    expect(afterWithdraw.depositedAmount).toBe(0n)
  })

  it('registers with YieldBackendRegistry', async () => {
    const { YieldBackendRegistry } = await import('@nanuqfi/core')
    const registry = new YieldBackendRegistry()
    const backend = new LuloLendingBackend()
    registry.register(backend)
    expect(registry.get('lulo-lending')?.name).toBe('lulo-lending')
  })
})

// ─── Real mode ────────────────────────────────────────────────────────────────

describe('LuloLendingBackend — real mode', () => {
  beforeEach(() => {
    clearLuloCache()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('throws if constructed without apiKey in real mode', () => {
    expect(() => new LuloLendingBackend({ mockMode: false })).toThrow(
      'LULO_API_KEY required for real mode'
    )
  })

  it('fetches live APY from Lulo rates API', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_RATES_RESPONSE),
    } as Response)

    const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })
    const estimate = await backend.getExpectedYield()

    // 8.25% → 0.0825
    expect(estimate.annualizedApy).toBeCloseTo(0.0825, 4)
    expect(estimate.metadata?.mode).toBe('real')
    expect(estimate.metadata?.protocol).toBe('lulo')
  })

  it('computes risk from pool utilization (low utilization = low volatility)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_POOL_RESPONSE),
    } as Response)

    const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })
    const risk = await backend.getRisk()

    // availableLiquidity = 18890311, totalLiquidity = 19355811
    // utilization = 1 - 18890311/19355811 ≈ 0.024
    // volatility = 0.01 + 0.024 * 0.03 ≈ low
    expect(risk.volatilityScore).toBeLessThan(0.05)
    expect(risk.liquidationRisk).toBe('none')
    expect(risk.metadata?.utilization).toBeDefined()
  })

  it('deposit stub returns pending-allocator-cpi signature', async () => {
    const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })
    const tx = await backend.deposit(100_000_000n)
    expect(tx).toContain('pending-allocator-cpi')
  })
})
