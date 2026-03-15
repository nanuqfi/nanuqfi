import { describe, it, expect } from 'vitest'
import { DriftJitoDNBackend } from './jito-dn'

describe('DriftJitoDNBackend', () => {
  const backend = new DriftJitoDNBackend({ mockMode: true })

  it('has correct name', () => {
    expect(backend.name).toBe('drift-jito-dn')
  })

  it('has correct capabilities', () => {
    const caps = backend.capabilities
    expect(caps.supportedAssets).toEqual(['USDC', 'JitoSOL'])
    expect(caps.supportsLeverage).toBe(false)
    expect(caps.maxLeverage).toBe(1)
    expect(caps.isDeltaNeutral).toBe(true)
    expect(caps.hasAutoExit).toBe(true)
    expect(caps.liquidationRisk).toBe('low')
    expect(caps.withdrawalDelay).toBe(0)
  })

  it('returns yield estimate with 22% APY in mock mode', async () => {
    const estimate = await backend.getExpectedYield()
    expect(estimate.annualizedApy).toBe(0.22)
    expect(estimate.source).toBe('drift-jito-dn')
    expect(estimate.asset).toBe('USDC')
  })

  it('returns risk metrics with volatilityScore 0.18', async () => {
    const risk = await backend.getRisk()
    expect(risk.volatilityScore).toBe(0.18)
    expect(risk.liquidationRisk).toBe('low')
  })

  it('triggers auto-exit when SOL borrow rate exceeds JitoSOL staking yield', () => {
    expect(backend.shouldAutoExit(0.08, 0.07)).toBe(true)
    expect(backend.shouldAutoExit(0.10, 0.07)).toBe(true)
  })

  it('triggers auto-exit when SOL borrow rate equals JitoSOL staking yield', () => {
    // Equal means profit has vanished — should exit
    expect(backend.shouldAutoExit(0.07, 0.07)).toBe(true)
  })

  it('does not trigger auto-exit when staking yield exceeds borrow rate', () => {
    expect(backend.shouldAutoExit(0.06, 0.07)).toBe(false)
    expect(backend.shouldAutoExit(0.05, 0.08)).toBe(false)
  })

  it('throws in real mode for deposit without driftClient', async () => {
    const realBackend = new DriftJitoDNBackend({ mockMode: false })
    await expect(realBackend.deposit(1_000_000n)).rejects.toThrow('DriftClient required')
  })

  it('throws in real mode for getExpectedYield without driftClient', async () => {
    const realBackend = new DriftJitoDNBackend({ mockMode: false })
    await expect(realBackend.getExpectedYield()).rejects.toThrow('DriftClient required')
  })
})

describe('DriftJitoDNBackend real mode', () => {
  it('accepts driftClient in constructor', () => {
    const mockDriftClient = {} as any
    const backend = new DriftJitoDNBackend({ mockMode: false, driftClient: mockDriftClient })
    expect(backend.name).toBe('drift-jito-dn')
  })

  it('throws if real mode without driftClient for getRisk', async () => {
    const backend = new DriftJitoDNBackend({ mockMode: false })
    await expect(backend.getRisk()).rejects.toThrow('DriftClient required')
  })

  it('throws if real mode without driftClient for withdraw', async () => {
    const backend = new DriftJitoDNBackend({ mockMode: false })
    await expect(backend.withdraw(1_000_000n)).rejects.toThrow('DriftClient required')
  })

  it('throws if real mode without driftClient for getPosition', async () => {
    const backend = new DriftJitoDNBackend({ mockMode: false })
    await expect(backend.getPosition()).rejects.toThrow('DriftClient required')
  })

  it('preserves mock mode behavior', async () => {
    const backend = new DriftJitoDNBackend({ mockMode: true, mockApy: 0.25 })
    const yield_ = await backend.getExpectedYield()
    expect(yield_.annualizedApy).toBe(0.25)
    expect(yield_.metadata?.mode).toBe('mock')
  })

  it('preserves mock mode risk metrics', async () => {
    const backend = new DriftJitoDNBackend({ mockMode: true, mockVolatility: 0.20 })
    const risk = await backend.getRisk()
    expect(risk.volatilityScore).toBe(0.20)
    expect(risk.metadata?.mode).toBe('mock')
  })

  it('returns slippage 3 in real mode without needing driftClient', async () => {
    const backend = new DriftJitoDNBackend({ mockMode: false })
    const slippage = await backend.estimateSlippage(1_000_000n)
    expect(slippage).toBe(3)
  })

  it('defaults to real mode when no config provided', () => {
    const backend = new DriftJitoDNBackend()
    expect(backend.name).toBe('drift-jito-dn')
  })

  it('shouldAutoExit works without mock mode — pure function', () => {
    const realBackend = new DriftJitoDNBackend({ mockMode: false })
    expect(realBackend.shouldAutoExit(0.08, 0.07)).toBe(true)
    expect(realBackend.shouldAutoExit(0.05, 0.07)).toBe(false)
    expect(realBackend.shouldAutoExit(0.07, 0.07)).toBe(true)
  })
})
