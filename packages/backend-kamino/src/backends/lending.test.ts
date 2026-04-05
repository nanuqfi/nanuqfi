import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { KaminoLendingBackend } from './lending'
import { clearKaminoCache } from '../utils/kamino-api'

const MOCK_RESERVE_RESPONSE = [
  {
    reserve: 'D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59',
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

describe('KaminoLendingBackend — mock mode', () => {
  it('implements YieldBackend interface', () => {
    const backend = new KaminoLendingBackend()
    expect(backend.name).toBe('kamino-lending')
    expect(backend.capabilities.supportedAssets).toContain('USDC')
  })

  it('returns mock yield in mock mode', async () => {
    const backend = new KaminoLendingBackend()
    const estimate = await backend.getExpectedYield()
    expect(estimate.annualizedApy).toBe(0.045)
    expect(estimate.metadata?.mode).toBe('mock')
    expect(estimate.metadata?.protocol).toBe('kamino')
  })

  it('accepts custom APY override', async () => {
    const backend = new KaminoLendingBackend({ mockApy: 0.10 })
    const estimate = await backend.getExpectedYield()
    expect(estimate.annualizedApy).toBe(0.10)
  })

  it('returns low-risk metrics', async () => {
    const backend = new KaminoLendingBackend()
    const risk = await backend.getRisk()
    expect(risk.liquidationRisk).toBe('none')
    expect(risk.volatilityScore).toBeLessThan(0.1)
  })

  it('estimates near-zero slippage', async () => {
    const backend = new KaminoLendingBackend()
    const slippage = await backend.estimateSlippage(1_000_000n)
    expect(slippage).toBeLessThanOrEqual(5)
  })

  it('tracks deposit/withdraw state', async () => {
    const backend = new KaminoLendingBackend()

    const posBefore = await backend.getPosition()
    expect(posBefore.isActive).toBe(false)

    await backend.deposit(100_000_000n)
    const posAfter = await backend.getPosition()
    expect(posAfter.isActive).toBe(true)
    expect(posAfter.depositedAmount).toBe(100_000_000n)

    await backend.withdraw(100_000_000n)
    const posFinal = await backend.getPosition()
    expect(posFinal.isActive).toBe(false)
  })

  it('registers with YieldBackendRegistry', async () => {
    const { YieldBackendRegistry } = await import('@nanuqfi/core')
    const registry = new YieldBackendRegistry()
    const backend = new KaminoLendingBackend()
    registry.register(backend)
    expect(registry.get('kamino-lending')?.name).toBe('kamino-lending')
  })
})

describe('KaminoLendingBackend — real mode', () => {
  beforeEach(() => {
    clearKaminoCache()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches live APY from Kamino API', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_RESERVE_RESPONSE),
    } as Response)

    const backend = new KaminoLendingBackend({ mockMode: false })
    const estimate = await backend.getExpectedYield()

    expect(estimate.annualizedApy).toBe(0.021)
    expect(estimate.metadata?.mode).toBe('real')
  })

  it('computes risk from utilization', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_RESERVE_RESPONSE),
    } as Response)

    const backend = new KaminoLendingBackend({ mockMode: false })
    const risk = await backend.getRisk()

    // utilization = 155M/209M ≈ 0.7416
    // volatility = 0.02 + 0.7416 * 0.08 ≈ 0.0793
    expect(risk.volatilityScore).toBeCloseTo(0.0793, 2)
    expect(risk.metadata?.utilization).toBeCloseTo(0.7416, 3)
  })

  it('deposit returns allocator-cpi stub', async () => {
    const backend = new KaminoLendingBackend({ mockMode: false })
    const tx = await backend.deposit(100_000_000n)
    expect(tx).toContain('pending-allocator-cpi')
  })
})
