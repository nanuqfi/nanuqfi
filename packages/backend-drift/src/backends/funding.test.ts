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

  it('throws in real mode', async () => {
    const realBackend = new DriftFundingBackend({ mockMode: false })
    await expect(realBackend.getExpectedYield()).rejects.toThrow('not yet implemented')
  })
})
