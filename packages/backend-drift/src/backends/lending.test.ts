import { describe, it, expect } from 'vitest'
import { DriftLendingBackend } from './lending'

describe('DriftLendingBackend', () => {
  const backend = new DriftLendingBackend({ mockMode: true })

  it('has correct name', () => {
    expect(backend.name).toBe('drift-lending')
  })

  it('has correct capabilities', () => {
    const caps = backend.capabilities
    expect(caps.supportedAssets).toEqual(['USDC'])
    expect(caps.supportsLeverage).toBe(false)
    expect(caps.maxLeverage).toBe(1)
    expect(caps.isDeltaNeutral).toBe(false)
    expect(caps.hasAutoExit).toBe(false)
    expect(caps.liquidationRisk).toBe('none')
    expect(caps.withdrawalDelay).toBe(0)
  })

  it('returns yield estimate with 8% APY in mock mode', async () => {
    const estimate = await backend.getExpectedYield()
    expect(estimate.annualizedApy).toBe(0.08)
    expect(estimate.source).toBe('drift-lending')
    expect(estimate.asset).toBe('USDC')
    expect(estimate.confidence).toBeGreaterThan(0)
    expect(estimate.timestamp).toBeGreaterThan(0)
  })

  it('returns risk metrics with low volatility', async () => {
    const risk = await backend.getRisk()
    expect(risk.volatilityScore).toBe(0.05)
    expect(risk.liquidationRisk).toBe('none')
    expect(typeof risk.maxDrawdown).toBe('number')
    expect(typeof risk.correlationToMarket).toBe('number')
  })

  it('estimates slippage as a number', async () => {
    const bps = await backend.estimateSlippage(1_000_000n)
    expect(typeof bps).toBe('number')
    expect(bps).toBeGreaterThanOrEqual(0)
  })

  it('throws in real mode for deposit', async () => {
    const realBackend = new DriftLendingBackend({ mockMode: false })
    await expect(realBackend.deposit(1_000_000n)).rejects.toThrow('not yet implemented')
  })

  it('throws in real mode for getExpectedYield', async () => {
    const realBackend = new DriftLendingBackend({ mockMode: false })
    await expect(realBackend.getExpectedYield()).rejects.toThrow('not yet implemented')
  })
})
