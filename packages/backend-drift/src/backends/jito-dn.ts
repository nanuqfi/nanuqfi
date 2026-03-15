import type {
  YieldBackend,
  BackendCapabilities,
  YieldEstimate,
  RiskMetrics,
  PositionState,
  TxSignature,
} from '@nanuqfi/core'

export interface DriftJitoDNConfig {
  mockMode?: boolean
  mockApy?: number
  mockVolatility?: number
}

const NOT_IMPLEMENTED = 'DriftJitoDNBackend: real mode not yet implemented. Use mockMode for unit testing.'

export class DriftJitoDNBackend implements YieldBackend {
  readonly name = 'drift-jito-dn'

  readonly capabilities: BackendCapabilities = {
    supportedAssets: ['USDC', 'JitoSOL'],
    supportsLeverage: false,
    maxLeverage: 1,
    isDeltaNeutral: true,
    hasAutoExit: true,
    liquidationRisk: 'low',
    minDeposit: 10_000_000n,         // 10 USDC
    maxDeposit: 500_000_000_000n,    // 500,000 USDC
    withdrawalDelay: 0,
    features: ['delta-neutral', 'jito-staking-yield', 'drift-borrow-arb', 'auto-exit-on-inverted-carry'],
  }

  private readonly config: Required<DriftJitoDNConfig>

  constructor(config: DriftJitoDNConfig = {}) {
    this.config = {
      mockMode: config.mockMode ?? false,
      mockApy: config.mockApy ?? 0.22,
      mockVolatility: config.mockVolatility ?? 0.18,
    }
  }

  /**
   * Returns true when the carry trade has inverted — i.e., SOL borrow cost has
   * reached or exceeded the JitoSOL staking yield, eliminating (or reversing) profit.
   *
   * Strategy: hold JitoSOL (earn staking yield) + short SOL via Drift borrow
   * (pay borrow rate). Profitable only while jitoStakingYield > solBorrowRate.
   *
   * @param solBorrowRate    - Annualized borrow rate for SOL on Drift (decimal)
   * @param jitoStakingYield - Annualized JitoSOL staking yield (decimal)
   */
  shouldAutoExit(solBorrowRate: number, jitoStakingYield: number): boolean {
    return solBorrowRate >= jitoStakingYield
  }

  async getExpectedYield(): Promise<YieldEstimate> {
    if (!this.config.mockMode) {
      throw new Error(NOT_IMPLEMENTED)
    }
    return {
      annualizedApy: this.config.mockApy,
      source: this.name,
      asset: 'USDC',
      confidence: 0.82,
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
      maxDrawdown: 0.03,
      liquidationRisk: 'low',
      correlationToMarket: 0.15,
      metadata: { mode: 'mock' },
    }
  }

  async estimateSlippage(_amount: bigint): Promise<number> {
    if (!this.config.mockMode) {
      throw new Error(NOT_IMPLEMENTED)
    }
    return 3
  }

  async deposit(_amount: bigint, _params?: Record<string, unknown>): Promise<TxSignature> {
    if (!this.config.mockMode) {
      throw new Error(NOT_IMPLEMENTED)
    }
    return `mock-tx-drift-jito-dn-deposit-${Date.now()}`
  }

  async withdraw(_amount: bigint): Promise<TxSignature> {
    if (!this.config.mockMode) {
      throw new Error(NOT_IMPLEMENTED)
    }
    return `mock-tx-drift-jito-dn-withdraw-${Date.now()}`
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
