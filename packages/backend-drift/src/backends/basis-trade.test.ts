import { describe, it, expect } from 'vitest'
import { DriftBasisTradeBackend } from './basis-trade'

describe('DriftBasisTradeBackend', () => {
  const backend = new DriftBasisTradeBackend({ mockMode: true })

  it('has correct name', () => {
    expect(backend.name).toBe('drift-basis')
  })

  it('has correct capabilities', () => {
    const caps = backend.capabilities
    expect(caps.supportedAssets).toEqual(['USDC', 'SOL', 'BTC', 'ETH'])
    expect(caps.supportsLeverage).toBe(false)
    expect(caps.maxLeverage).toBe(1)
    expect(caps.isDeltaNeutral).toBe(true)
    expect(caps.hasAutoExit).toBe(true)
    expect(caps.liquidationRisk).toBe('low')
    expect(caps.withdrawalDelay).toBe(0)
  })

  it('returns yield estimate with 20% APY in mock mode', async () => {
    const estimate = await backend.getExpectedYield()
    expect(estimate.annualizedApy).toBe(0.20)
    expect(estimate.source).toBe('drift-basis')
    expect(estimate.asset).toBe('USDC')
  })

  it('returns risk metrics with volatilityScore 0.2', async () => {
    const risk = await backend.getRisk()
    expect(risk.volatilityScore).toBe(0.2)
    expect(risk.liquidationRisk).toBe('low')
  })

  it('triggers auto-exit when 16+ consecutive negative funding entries', () => {
    // 16 entries of -0.01 each — exactly 4 hours at 15-min intervals
    const history = Array(16).fill(-0.01)
    expect(backend.shouldAutoExit(history)).toBe(true)
  })

  it('triggers auto-exit when more than 16 consecutive negative entries', () => {
    const history = Array(24).fill(-0.005)
    expect(backend.shouldAutoExit(history)).toBe(true)
  })

  it('does not trigger auto-exit when fewer than 16 negative entries', () => {
    // Only 15 negative — not enough
    const history = Array(15).fill(-0.01)
    expect(backend.shouldAutoExit(history)).toBe(false)
  })

  it('does not trigger auto-exit when recent entries break the streak', () => {
    // 16 entries but last one is positive
    const history = [...Array(15).fill(-0.01), 0.01]
    expect(backend.shouldAutoExit(history)).toBe(false)
  })

  it('does not trigger auto-exit with empty history', () => {
    expect(backend.shouldAutoExit([])).toBe(false)
  })

  it('uses last 16 entries only — mixed but tail is all negative', () => {
    // 20 entries: first 4 positive, last 16 all negative
    const history = [...Array(4).fill(0.01), ...Array(16).fill(-0.01)]
    expect(backend.shouldAutoExit(history)).toBe(true)
  })

  it('throws in real mode without driftClient', async () => {
    const realBackend = new DriftBasisTradeBackend({ mockMode: false })
    await expect(realBackend.getExpectedYield()).rejects.toThrow('DriftClient required')
  })
})

describe('DriftBasisTradeBackend real mode', () => {
  it('accepts driftClient in constructor', () => {
    const backend = new DriftBasisTradeBackend({ mockMode: false, driftClient: {} as any })
    expect(backend.name).toBe('drift-basis')
  })

  it('throws if real mode without driftClient for getExpectedYield', async () => {
    const backend = new DriftBasisTradeBackend({ mockMode: false })
    await expect(backend.getExpectedYield()).rejects.toThrow('DriftClient required')
  })

  it('throws if real mode without driftClient for getRisk', async () => {
    const backend = new DriftBasisTradeBackend({ mockMode: false })
    await expect(backend.getRisk()).rejects.toThrow('DriftClient required')
  })

  it('throws if real mode without driftClient for deposit', async () => {
    const backend = new DriftBasisTradeBackend({ mockMode: false })
    await expect(backend.deposit(1_000_000n)).rejects.toThrow('DriftClient required')
  })

  it('throws if real mode without driftClient for withdraw', async () => {
    const backend = new DriftBasisTradeBackend({ mockMode: false })
    await expect(backend.withdraw(1_000_000n)).rejects.toThrow('DriftClient required')
  })

  it('throws if real mode without driftClient for getPosition', async () => {
    const backend = new DriftBasisTradeBackend({ mockMode: false })
    await expect(backend.getPosition()).rejects.toThrow('DriftClient required')
  })

  it('returns slippage 5 in real mode without driftClient', async () => {
    const backend = new DriftBasisTradeBackend({ mockMode: false })
    const slippage = await backend.estimateSlippage(1_000_000n)
    expect(slippage).toBe(5)
  })

  it('preserves mock mode behavior', async () => {
    const backend = new DriftBasisTradeBackend({ mockMode: true, mockApy: 0.25 })
    const yield_ = await backend.getExpectedYield()
    expect(yield_.annualizedApy).toBe(0.25)
    expect(yield_.metadata?.mode).toBe('mock')
  })

  it('preserves mock mode risk metrics', async () => {
    const backend = new DriftBasisTradeBackend({ mockMode: true, mockVolatility: 0.15 })
    const risk = await backend.getRisk()
    expect(risk.volatilityScore).toBe(0.15)
    expect(risk.metadata?.mode).toBe('mock')
  })

  it('preserves shouldAutoExit behavior', () => {
    const backend = new DriftBasisTradeBackend({ mockMode: true })
    expect(backend.shouldAutoExit([-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1])).toBe(true)
    expect(backend.shouldAutoExit([1, 1, 1, 1])).toBe(false)
  })

  it('defaults to real mode when no config provided', () => {
    const backend = new DriftBasisTradeBackend()
    expect(backend.name).toBe('drift-basis')
  })
})
