import { describe, it, expect } from 'vitest'
import { DriftFundingBackend } from './funding'

describe('DriftFundingBackend', () => {
  const backend = new DriftFundingBackend({ mockMode: true })

  it('has correct name', () => {
    expect(backend.name).toBe('drift-funding')
  })

  it('has correct capabilities', () => {
    const caps = backend.capabilities
    expect(caps.supportedAssets).toEqual(['USDC', 'SOL', 'BTC', 'ETH'])
    expect(caps.supportsLeverage).toBe(true)
    expect(caps.maxLeverage).toBe(3)
    expect(caps.isDeltaNeutral).toBe(false)
    expect(caps.hasAutoExit).toBe(true)
    expect(caps.liquidationRisk).toBe('medium')
    expect(caps.withdrawalDelay).toBe(0)
  })

  it('returns yield estimate with 30% APY in mock mode', async () => {
    const estimate = await backend.getExpectedYield()
    expect(estimate.annualizedApy).toBe(0.30)
    expect(estimate.source).toBe('drift-funding')
    expect(estimate.asset).toBe('USDC')
  })

  it('returns risk metrics with volatilityScore 0.35', async () => {
    const risk = await backend.getRisk()
    expect(risk.volatilityScore).toBe(0.35)
    expect(risk.liquidationRisk).toBe('medium')
  })

  it('triggers auto-exit at exactly -2% PnL for moderate risk level', () => {
    expect(backend.shouldAutoExit(-0.02, 'moderate')).toBe(true)
    expect(backend.shouldAutoExit(-0.025, 'moderate')).toBe(true)
  })

  it('does not trigger auto-exit above -2% for moderate', () => {
    expect(backend.shouldAutoExit(-0.019, 'moderate')).toBe(false)
    expect(backend.shouldAutoExit(0, 'moderate')).toBe(false)
    expect(backend.shouldAutoExit(0.05, 'moderate')).toBe(false)
  })

  it('triggers auto-exit at exactly -5% PnL for aggressive risk level', () => {
    expect(backend.shouldAutoExit(-0.05, 'aggressive')).toBe(true)
    expect(backend.shouldAutoExit(-0.06, 'aggressive')).toBe(true)
  })

  it('does not trigger auto-exit above -5% for aggressive', () => {
    expect(backend.shouldAutoExit(-0.049, 'aggressive')).toBe(false)
    expect(backend.shouldAutoExit(-0.02, 'aggressive')).toBe(false)
  })

  it('uses conservative threshold for unknown risk level (defaults to moderate -2%)', () => {
    expect(backend.shouldAutoExit(-0.02, 'conservative')).toBe(true)
    expect(backend.shouldAutoExit(-0.019, 'conservative')).toBe(false)
  })

  it('throws in real mode without driftClient', async () => {
    const realBackend = new DriftFundingBackend({ mockMode: false })
    await expect(realBackend.getExpectedYield()).rejects.toThrow('DriftClient required')
  })
})

describe('DriftFundingBackend real mode', () => {
  it('accepts driftClient in constructor', () => {
    const mockDriftClient = {} as any
    const backend = new DriftFundingBackend({ mockMode: false, driftClient: mockDriftClient })
    expect(backend.name).toBe('drift-funding')
  })

  it('throws if real mode without driftClient for getRisk', async () => {
    const backend = new DriftFundingBackend({ mockMode: false })
    await expect(backend.getRisk()).rejects.toThrow('DriftClient required')
  })

  it('throws if real mode without driftClient for deposit', async () => {
    const backend = new DriftFundingBackend({ mockMode: false })
    await expect(backend.deposit(1_000_000n)).rejects.toThrow('DriftClient required')
  })

  it('throws if real mode without driftClient for withdraw', async () => {
    const backend = new DriftFundingBackend({ mockMode: false })
    await expect(backend.withdraw(1_000_000n)).rejects.toThrow('DriftClient required')
  })

  it('throws if real mode without driftClient for getPosition', async () => {
    const backend = new DriftFundingBackend({ mockMode: false })
    await expect(backend.getPosition()).rejects.toThrow('DriftClient required')
  })

  it('returns slippage 10 in real mode without driftClient', async () => {
    const backend = new DriftFundingBackend({ mockMode: false })
    const slippage = await backend.estimateSlippage(1_000_000n)
    expect(slippage).toBe(10)
  })

  it('preserves mock mode yield with custom APY', async () => {
    const backend = new DriftFundingBackend({ mockMode: true, mockApy: 0.40 })
    const yield_ = await backend.getExpectedYield()
    expect(yield_.annualizedApy).toBe(0.40)
    expect(yield_.metadata?.mode).toBe('mock')
  })

  it('preserves mock mode risk metrics with custom volatility', async () => {
    const backend = new DriftFundingBackend({ mockMode: true, mockVolatility: 0.50 })
    const risk = await backend.getRisk()
    expect(risk.volatilityScore).toBe(0.50)
    expect(risk.metadata?.mode).toBe('mock')
  })

  it('defaults to real mode when no config provided', () => {
    const backend = new DriftFundingBackend()
    expect(backend.name).toBe('drift-funding')
  })

  it('shouldAutoExit works without mock mode (pure function)', () => {
    const realBackend = new DriftFundingBackend({ mockMode: false })
    expect(realBackend.shouldAutoExit(-0.02, 'moderate')).toBe(true)
    expect(realBackend.shouldAutoExit(-0.01, 'moderate')).toBe(false)
    expect(realBackend.shouldAutoExit(-0.05, 'aggressive')).toBe(true)
    expect(realBackend.shouldAutoExit(-0.03, 'aggressive')).toBe(false)
  })

  it('shouldAutoExit falls back to moderate threshold for unknown risk level', () => {
    const backend = new DriftFundingBackend({ mockMode: false })
    expect(backend.shouldAutoExit(-0.02, 'unknown-tier')).toBe(true)
    expect(backend.shouldAutoExit(-0.019, 'unknown-tier')).toBe(false)
  })
})
