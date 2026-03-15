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

  it('throws in real mode', async () => {
    const realBackend = new DriftJitoDNBackend({ mockMode: false })
    await expect(realBackend.getExpectedYield()).rejects.toThrow('not yet implemented')
  })
})
