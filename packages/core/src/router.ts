import type { YieldBackend, BackendCapabilities } from './interfaces'
import type { Asset } from './types'
import { CircuitBreaker } from './circuit-breaker'

interface YieldQuery {
  asset: Asset
  minYield?: number
}

export interface RankedYield {
  backend: string
  annualizedApy: number
  volatilityScore: number
  riskAdjustedScore: number
  confidence: number
}

interface BackendSource {
  filterByCapability(predicate: (c: BackendCapabilities) => boolean): YieldBackend[]
}

export class YieldRouter {
  private readonly source: BackendSource
  private readonly breakers: Map<string, CircuitBreaker> = new Map()

  constructor(source: BackendSource) {
    this.source = source
  }

  async getBestYields(query: YieldQuery): Promise<RankedYield[]> {
    const backends = this.source.filterByCapability(c =>
      c.supportedAssets.includes(query.asset)
    )

    const results = await Promise.allSettled(
      backends.map(async backend => {
        const breaker = this.getBreaker(backend.name)
        const [yieldEst, risk] = await breaker.execute(() =>
          Promise.all([backend.getExpectedYield(), backend.getRisk()])
        )

        const volatility = Math.max(risk.volatilityScore, 0.001)
        const riskAdjustedScore = yieldEst.annualizedApy / volatility

        return {
          backend: backend.name,
          annualizedApy: yieldEst.annualizedApy,
          volatilityScore: risk.volatilityScore,
          riskAdjustedScore,
          confidence: yieldEst.confidence,
        }
      })
    )

    return results
      .filter((r): r is PromiseFulfilledResult<RankedYield> => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(r => query.minYield === undefined || r.annualizedApy >= query.minYield)
      .sort((a, b) => b.riskAdjustedScore - a.riskAdjustedScore)
  }

  private getBreaker(name: string): CircuitBreaker {
    let breaker = this.breakers.get(name)
    if (!breaker) {
      breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 30_000 })
      this.breakers.set(name, breaker)
    }
    return breaker
  }
}
