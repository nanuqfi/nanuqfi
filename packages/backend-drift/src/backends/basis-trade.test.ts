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

  it('throws in real mode', async () => {
    const realBackend = new DriftBasisTradeBackend({ mockMode: false })
    await expect(realBackend.getExpectedYield()).rejects.toThrow('not yet implemented')
  })
})
