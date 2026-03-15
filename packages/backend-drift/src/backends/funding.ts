import type {
  YieldBackend,
  BackendCapabilities,
  YieldEstimate,
  RiskMetrics,
  PositionState,
  TxSignature,
  RiskLevel,
} from '@nanuqfi/core'

export interface DriftFundingConfig {
  mockMode?: boolean
  mockApy?: number
  mockVolatility?: number
}

const NOT_IMPLEMENTED = 'DriftFundingBackend: real mode not yet implemented. Use mockMode for unit testing.'

/**
 * PnL stop-loss thresholds per risk level.
 * Aggressive tolerates more drawdown before exiting; conservative and moderate exit earlier.
 * Note: values are negative decimals (losses).
 */
const STOP_LOSS_BY_RISK: Record<string, number> = {
  conservative: -0.02,
  moderate: -0.02,
  aggressive: -0.05,
}

export class DriftFundingBackend implements YieldBackend {
  readonly name = 'drift-funding'

  readonly capabilities: BackendCapabilities = {
    supportedAssets: ['USDC', 'SOL', 'BTC', 'ETH'],
    supportsLeverage: true,
    maxLeverage: 3,
    isDeltaNeutral: false,
    hasAutoExit: true,
    liquidationRisk: 'medium',
    minDeposit: 10_000_000n,         // 10 USDC
    maxDeposit: 500_000_000_000n,    // 500,000 USDC
    withdrawalDelay: 0,
    features: ['drift-perp-funding', 'leveraged', 'auto-exit-on-pnl-loss'],
  }

  private readonly config: Required<DriftFundingConfig>

  constructor(config: DriftFundingConfig = {}) {
    this.config = {
      mockMode: config.mockMode ?? false,
      mockApy: config.mockApy ?? 0.30,
      mockVolatility: config.mockVolatility ?? 0.35,
    }
  }

  /**
   * Returns true when the position's unrealized PnL has fallen to or below the
   * stop-loss threshold for the given risk level.
   *
   * - conservative / moderate: exit at -2%
   * - aggressive: exit at -5%
   *
   * Any unknown risk level falls back to the conservative threshold (-2%).
   *
   * @param unrealizedPnlPercent - PnL as a decimal (negative = loss, e.g. -0.02 = -2%)
   * @param riskLevel - Vault risk tier
   */
  shouldAutoExit(unrealizedPnlPercent: number, riskLevel: string): boolean {
    const threshold = STOP_LOSS_BY_RISK[riskLevel as RiskLevel] ?? STOP_LOSS_BY_RISK['moderate']!
    return unrealizedPnlPercent <= threshold
  }

  async getExpectedYield(): Promise<YieldEstimate> {
    if (!this.config.mockMode) {
      throw new Error(NOT_IMPLEMENTED)
    }
    return {
      annualizedApy: this.config.mockApy,
      source: this.name,
      asset: 'USDC',
      confidence: 0.75,
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
      maxDrawdown: 0.08,
      liquidationRisk: 'medium',
      correlationToMarket: 0.45,
      metadata: { mode: 'mock' },
    }
  }

  async estimateSlippage(_amount: bigint): Promise<number> {
    if (!this.config.mockMode) {
      throw new Error(NOT_IMPLEMENTED)
    }
    // Leveraged perp — higher slippage risk
    return 10
  }

  async deposit(_amount: bigint, _params?: Record<string, unknown>): Promise<TxSignature> {
    if (!this.config.mockMode) {
      throw new Error(NOT_IMPLEMENTED)
    }
    return `mock-tx-drift-funding-deposit-${Date.now()}`
  }

  async withdraw(_amount: bigint): Promise<TxSignature> {
    if (!this.config.mockMode) {
      throw new Error(NOT_IMPLEMENTED)
    }
    return `mock-tx-drift-funding-withdraw-${Date.now()}`
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
