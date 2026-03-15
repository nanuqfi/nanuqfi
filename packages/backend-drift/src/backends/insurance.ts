import type {
  YieldBackend,
  BackendCapabilities,
  YieldEstimate,
  RiskMetrics,
  PositionState,
  TxSignature,
} from '@nanuqfi/core'

export interface DriftInsuranceConfig {
  mockMode?: boolean
  mockApy?: number
  mockVolatility?: number
  /**
   * Drawdown threshold (as decimal) above which auto-exit triggers.
   * Default: 0.30 (30%)
   */
  autoExitDrawdownThreshold?: number
}

const NOT_IMPLEMENTED = 'DriftInsuranceBackend: real mode not yet implemented. Use mockMode for unit testing.'

export class DriftInsuranceBackend implements YieldBackend {
  readonly name = 'drift-insurance'

  readonly capabilities: BackendCapabilities = {
    supportedAssets: ['USDC'],
    supportsLeverage: false,
    maxLeverage: 1,
    isDeltaNeutral: false,
    hasAutoExit: true,
    liquidationRisk: 'low',
    minDeposit: 1_000_000n,          // 1 USDC
    maxDeposit: 100_000_000_000n,    // 100,000 USDC
    withdrawalDelay: 86400,          // 24h unstaking period
    features: ['drift-insurance-fund', 'auto-exit-on-drawdown'],
  }

  private readonly config: Required<DriftInsuranceConfig>

  constructor(config: DriftInsuranceConfig = {}) {
    this.config = {
      mockMode: config.mockMode ?? false,
      mockApy: config.mockApy ?? 0.12,
      mockVolatility: config.mockVolatility ?? 0.15,
      autoExitDrawdownThreshold: config.autoExitDrawdownThreshold ?? 0.30,
    }
  }

  /**
   * Returns true when the insurance fund drawdown reaches or exceeds the
   * configured threshold (default: 30%). This signals that the fund is taking
   * losses and depositors should be exited to limit further exposure.
   *
   * @param fundDrawdown - Current drawdown as a decimal (0.31 = 31%)
   */
  shouldAutoExit(fundDrawdown: number): boolean {
    return fundDrawdown >= this.config.autoExitDrawdownThreshold
  }

  async getExpectedYield(): Promise<YieldEstimate> {
    if (!this.config.mockMode) {
      throw new Error(NOT_IMPLEMENTED)
    }
    return {
      annualizedApy: this.config.mockApy,
      source: this.name,
      asset: 'USDC',
      confidence: 0.85,
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
      maxDrawdown: 0.05,
      liquidationRisk: 'low',
      correlationToMarket: 0.2,
      metadata: { mode: 'mock' },
    }
  }

  async estimateSlippage(_amount: bigint): Promise<number> {
    if (!this.config.mockMode) {
      throw new Error(NOT_IMPLEMENTED)
    }
    return 2
  }

  async deposit(_amount: bigint, _params?: Record<string, unknown>): Promise<TxSignature> {
    if (!this.config.mockMode) {
      throw new Error(NOT_IMPLEMENTED)
    }
    return `mock-tx-drift-insurance-deposit-${Date.now()}`
  }

  async withdraw(_amount: bigint): Promise<TxSignature> {
    if (!this.config.mockMode) {
      throw new Error(NOT_IMPLEMENTED)
    }
    return `mock-tx-drift-insurance-withdraw-${Date.now()}`
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
