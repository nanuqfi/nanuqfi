import type {
  YieldBackend,
  BackendCapabilities,
  YieldEstimate,
  RiskMetrics,
  PositionState,
  TxSignature,
} from '@nanuqfi/core'

export interface DriftBasisTradeConfig {
  mockMode?: boolean
  mockApy?: number
  mockVolatility?: number
  /**
   * Number of consecutive negative funding periods to trigger auto-exit.
   * Each period = 15 minutes. Default: 16 (= 4 hours).
   */
  negativeFundingPeriods?: number
}

const NOT_IMPLEMENTED = 'DriftBasisTradeBackend: real mode not yet implemented. Use mockMode for unit testing.'

export class DriftBasisTradeBackend implements YieldBackend {
  readonly name = 'drift-basis'

  readonly capabilities: BackendCapabilities = {
    supportedAssets: ['USDC', 'SOL', 'BTC', 'ETH'],
    supportsLeverage: false,
    maxLeverage: 1,
    isDeltaNeutral: true,
    hasAutoExit: true,
    liquidationRisk: 'low',
    minDeposit: 10_000_000n,         // 10 USDC
    maxDeposit: 500_000_000_000n,    // 500,000 USDC
    withdrawalDelay: 0,
    features: ['delta-neutral', 'drift-perp-basis', 'auto-exit-on-negative-funding'],
  }

  private readonly config: Required<DriftBasisTradeConfig>

  constructor(config: DriftBasisTradeConfig = {}) {
    this.config = {
      mockMode: config.mockMode ?? false,
      mockApy: config.mockApy ?? 0.20,
      mockVolatility: config.mockVolatility ?? 0.2,
      negativeFundingPeriods: config.negativeFundingPeriods ?? 16,
    }
  }

  /**
   * Evaluates whether the basis trade should auto-exit based on funding rate history.
   *
   * The strategy is only profitable when funding rates are positive (longs pay shorts).
   * If funding has been negative for 4 consecutive hours (16 × 15-min periods), the
   * edge has inverted and the position should be closed.
   *
   * @param fundingHistory - Array of funding rate values (each entry = 15-min period),
   *                         ordered oldest-to-newest.
   * @returns true when the last `negativeFundingPeriods` entries are ALL negative.
   */
  shouldAutoExit(fundingHistory: number[]): boolean {
    const requiredPeriods = this.config.negativeFundingPeriods
    if (fundingHistory.length < requiredPeriods) {
      return false
    }
    const tail = fundingHistory.slice(-requiredPeriods)
    return tail.every((rate) => rate < 0)
  }

  async getExpectedYield(): Promise<YieldEstimate> {
    if (!this.config.mockMode) {
      throw new Error(NOT_IMPLEMENTED)
    }
    return {
      annualizedApy: this.config.mockApy,
      source: this.name,
      asset: 'USDC',
      confidence: 0.80,
      timestamp: Date.now(),
      metadata: { mode: 'mock' },
    }
  }

  async getRisk(): Promise<RiskMetrics> {
    if (!this.config.mockMode) {
      throw new Error(NOT_IMPLEMENTED)
    }
    return {
      volatilityScore: this.config.mockVolatility,
      maxDrawdown: 0.04,
      liquidationRisk: 'low',
      correlationToMarket: 0.05,
      metadata: { mode: 'mock' },
    }
  }

  async estimateSlippage(_amount: bigint): Promise<number> {
    if (!this.config.mockMode) {
      throw new Error(NOT_IMPLEMENTED)
    }
    // Basis trade involves a perp leg — slightly higher slippage
    return 5
  }

  async deposit(_amount: bigint, _params?: Record<string, unknown>): Promise<TxSignature> {
    if (!this.config.mockMode) {
      throw new Error(NOT_IMPLEMENTED)
    }
    return `mock-tx-drift-basis-deposit-${Date.now()}`
  }

  async withdraw(_amount: bigint): Promise<TxSignature> {
    if (!this.config.mockMode) {
      throw new Error(NOT_IMPLEMENTED)
    }
    return `mock-tx-drift-basis-withdraw-${Date.now()}`
  }

  async getPosition(): Promise<PositionState> {
    if (!this.config.mockMode) {
      throw new Error(NOT_IMPLEMENTED)
    }
    return {
      backend: this.name,
      asset: 'USDC',
      depositedAmount: 0n,
      currentValue: 0n,
      unrealizedPnl: 0n,
      entryTimestamp: 0,
      isActive: false,
      metadata: { mode: 'mock' },
    }
  }
}
