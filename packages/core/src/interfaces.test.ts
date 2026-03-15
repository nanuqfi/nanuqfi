import { describe, it, expect } from 'vitest'
import type { YieldBackend, BackendCapabilities } from './interfaces'
import type { YieldEstimate, RiskMetrics, PositionState } from './types'

class TestBackend implements YieldBackend {
  readonly name = 'test-backend'
  readonly capabilities: BackendCapabilities = {
    supportedAssets: ['USDC'],
    supportsLeverage: false,
    maxLeverage: 1,
    isDeltaNeutral: false,
    hasAutoExit: false,
    liquidationRisk: 'none',
    minDeposit: 1_000_000n,
    maxDeposit: 1_000_000_000_000n,
    withdrawalDelay: 0,
  }

  async getExpectedYield(): Promise<YieldEstimate> {
    return {
      annualizedApy: 0.10,
      source: this.name,
      asset: 'USDC',
      confidence: 0.9,
      timestamp: Date.now(),
    }
  }

  async getRisk(): Promise<RiskMetrics> {
    return {
      volatilityScore: 0.1,
      maxDrawdown: 0.02,
      liquidationRisk: 'none',
      correlationToMarket: 0.3,
    }
  }

  async estimateSlippage(_amount: bigint): Promise<number> {
    return 5
  }

  async deposit(_amount: bigint): Promise<string> {
    return 'mock-tx-sig'
  }

  async withdraw(_amount: bigint): Promise<string> {
    return 'mock-tx-sig'
  }

  async getPosition(): Promise<PositionState> {
    return {
      backend: this.name,
      asset: 'USDC',
      depositedAmount: 0n,
      currentValue: 0n,
      unrealizedPnl: 0n,
      entryTimestamp: 0,
      isActive: false,
    }
  }
}

describe('YieldBackend interface', () => {
  it('can be implemented with correct shape', () => {
    const backend = new TestBackend()
    expect(backend.name).toBe('test-backend')
    expect(backend.capabilities.supportedAssets).toContain('USDC')
    expect(backend.capabilities.liquidationRisk).toBe('none')
  })

  it('returns yield estimate', async () => {
    const backend = new TestBackend()
    const estimate = await backend.getExpectedYield()
    expect(estimate.annualizedApy).toBeGreaterThan(0)
    expect(estimate.source).toBe('test-backend')
  })

  it('returns risk metrics', async () => {
    const backend = new TestBackend()
    const risk = await backend.getRisk()
    expect(risk.volatilityScore).toBeGreaterThanOrEqual(0)
    expect(risk.volatilityScore).toBeLessThanOrEqual(1)
  })

  it('returns slippage estimate in basis points', async () => {
    const backend = new TestBackend()
    const slippage = await backend.estimateSlippage(1_000_000n)
    expect(slippage).toBeGreaterThanOrEqual(0)
  })
})
