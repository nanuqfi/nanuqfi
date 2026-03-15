import { describe, it, expect } from 'vitest'
import { DriftInsuranceBackend } from './insurance'

describe('DriftInsuranceBackend', () => {
  const backend = new DriftInsuranceBackend({ mockMode: true })

  it('has correct name', () => {
    expect(backend.name).toBe('drift-insurance')
  })

  it('has correct capabilities', () => {
    const caps = backend.capabilities
    expect(caps.supportedAssets).toEqual(['USDC'])
    expect(caps.supportsLeverage).toBe(false)
    expect(caps.maxLeverage).toBe(1)
    expect(caps.isDeltaNeutral).toBe(false)
    expect(caps.hasAutoExit).toBe(true)
    expect(caps.liquidationRisk).toBe('low')
    expect(caps.withdrawalDelay).toBe(86400)
  })

  it('returns yield estimate with 12% APY in mock mode', async () => {
    const estimate = await backend.getExpectedYield()
    expect(estimate.annualizedApy).toBe(0.12)
    expect(estimate.source).toBe('drift-insurance')
    expect(estimate.asset).toBe('USDC')
  })

  it('returns risk metrics with moderate volatility', async () => {
    const risk = await backend.getRisk()
    expect(risk.volatilityScore).toBe(0.15)
    expect(risk.liquidationRisk).toBe('low')
  })

  it('triggers auto-exit when insurance fund drawdown exceeds 30%', () => {
    expect(backend.shouldAutoExit(0.31)).toBe(true)
    expect(backend.shouldAutoExit(0.30)).toBe(true)
  })

  it('does not trigger auto-exit below 30% drawdown', () => {
    expect(backend.shouldAutoExit(0.29)).toBe(false)
    expect(backend.shouldAutoExit(0)).toBe(false)
  })

  it('throws in real mode', async () => {
    const realBackend = new DriftInsuranceBackend({ mockMode: false })
    await expect(realBackend.getExpectedYield()).rejects.toThrow('not yet implemented')
  })
})
