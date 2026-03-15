import { describe, it, expect, beforeEach } from 'vitest'
import { YieldRouter } from './router'
import type { YieldBackend, BackendCapabilities } from './interfaces'
import type { YieldEstimate, RiskMetrics, PositionState } from './types'

// Inline mock for router tests (avoids dependency on Task 4's MockYieldBackend)
function createMockBackend(
  name: string,
  opts: { apy?: number; volatility?: number; shouldFail?: boolean; assets?: ('USDC' | 'SOL')[] } = {}
): YieldBackend {
  const shouldFail = opts.shouldFail ?? false
  return {
    name,
    capabilities: {
      supportedAssets: opts.assets ?? ['USDC'],
      supportsLeverage: false,
      maxLeverage: 1,
      isDeltaNeutral: false,
      hasAutoExit: false,
      liquidationRisk: 'none',
      minDeposit: 1_000_000n,
      maxDeposit: 1_000_000_000_000n,
      withdrawalDelay: 0,
    } as BackendCapabilities,
    async getExpectedYield(): Promise<YieldEstimate> {
      if (shouldFail) throw new Error('fail')
      return { annualizedApy: opts.apy ?? 0.10, source: name, asset: 'USDC', confidence: 0.9, timestamp: Date.now() }
    },
    async getRisk(): Promise<RiskMetrics> {
      if (shouldFail) throw new Error('fail')
      return { volatilityScore: opts.volatility ?? 0.1, maxDrawdown: 0.02, liquidationRisk: 'none', correlationToMarket: 0.3 }
    },
    async estimateSlippage() { return 5 },
    async deposit() { return 'tx' },
    async withdraw() { return 'tx' },
    async getPosition(): Promise<PositionState> {
      return { backend: name, asset: 'USDC', depositedAmount: 0n, currentValue: 0n, unrealizedPnl: 0n, entryTimestamp: 0, isActive: false }
    },
  }
}

// Minimal registry interface the router depends on
class SimpleRegistry {
  private backends: YieldBackend[] = []
  register(b: YieldBackend) { this.backends.push(b) }
  list() { return [...this.backends] }
  filterByCapability(pred: (c: BackendCapabilities) => boolean) {
    return this.backends.filter(b => pred(b.capabilities))
  }
}

describe('YieldRouter', () => {
  let registry: SimpleRegistry
  let router: YieldRouter

  beforeEach(() => {
    registry = new SimpleRegistry()
    router = new YieldRouter(registry)
  })

  it('ranks backends by risk-adjusted yield (highest first)', async () => {
    registry.register(createMockBackend('low-yield', { apy: 0.08, volatility: 0.1 }))
    registry.register(createMockBackend('high-yield', { apy: 0.25, volatility: 0.2 }))
    registry.register(createMockBackend('mid-yield', { apy: 0.15, volatility: 0.1 }))

    const ranked = await router.getBestYields({ asset: 'USDC' })
    expect(ranked[0].backend).toBe('mid-yield')
    expect(ranked[1].backend).toBe('high-yield')
    expect(ranked[2].backend).toBe('low-yield')
  })

  it('filters by minimum yield', async () => {
    registry.register(createMockBackend('low', { apy: 0.05 }))
    registry.register(createMockBackend('high', { apy: 0.20 }))

    const ranked = await router.getBestYields({ asset: 'USDC', minYield: 0.10 })
    expect(ranked).toHaveLength(1)
    expect(ranked[0].backend).toBe('high')
  })

  it('skips failing backends gracefully', async () => {
    registry.register(createMockBackend('healthy', { apy: 0.15 }))
    registry.register(createMockBackend('broken', { shouldFail: true }))

    const ranked = await router.getBestYields({ asset: 'USDC' })
    expect(ranked).toHaveLength(1)
    expect(ranked[0].backend).toBe('healthy')
  })

  it('returns empty array when all backends fail', async () => {
    registry.register(createMockBackend('broken1', { shouldFail: true }))
    registry.register(createMockBackend('broken2', { shouldFail: true }))

    const ranked = await router.getBestYields({ asset: 'USDC' })
    expect(ranked).toHaveLength(0)
  })

  it('filters by asset support', async () => {
    registry.register(createMockBackend('usdc-only', { assets: ['USDC'] }))
    registry.register(createMockBackend('sol-only', { assets: ['SOL'] }))

    const ranked = await router.getBestYields({ asset: 'USDC' })
    expect(ranked).toHaveLength(1)
    expect(ranked[0].backend).toBe('usdc-only')
  })
})
