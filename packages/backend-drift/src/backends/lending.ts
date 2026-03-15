import type {
  YieldBackend,
  BackendCapabilities,
  YieldEstimate,
  RiskMetrics,
  PositionState,
  TxSignature,
} from '@nanuqfi/core'

export interface DriftLendingConfig {
  mockMode?: boolean
  mockApy?: number
  mockVolatility?: number
}

const NOT_IMPLEMENTED = 'DriftLendingBackend: real mode not yet implemented. Use mockMode for unit testing.'

export class DriftLendingBackend implements YieldBackend {
  readonly name = 'drift-lending'

  readonly capabilities: BackendCapabilities = {
    supportedAssets: ['USDC'],
    supportsLeverage: false,
    maxLeverage: 1,
    isDeltaNeutral: false,
    hasAutoExit: false,
    liquidationRisk: 'none',
    minDeposit: 1_000_000n,          // 1 USDC (6 decimals)
    maxDeposit: 100_000_000_000n,    // 100,000 USDC
    withdrawalDelay: 0,
    features: ['drift-spot-lending'],
  }

  private readonly config: Required<DriftLendingConfig>

  constructor(config: DriftLendingConfig = {}) {
    this.config = {
      mockMode: config.mockMode ?? false,
      mockApy: config.mockApy ?? 0.08,
      mockVolatility: config.mockVolatility ?? 0.05,
    }
  }

  async getExpectedYield(): Promise<YieldEstimate> {
    if (!this.config.mockMode) {
      throw new Error(NOT_IMPLEMENTED)
    }
    return {
      annualizedApy: this.config.mockApy,
      source: this.name,
      asset: 'USDC',
      confidence: 0.92,
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
      maxDrawdown: 0.01,
      liquidationRisk: 'none',
      correlationToMarket: 0.1,
      metadata: { mode: 'mock' },
    }
  }

  async estimateSlippage(_amount: bigint): Promise<number> {
    if (!this.config.mockMode) {
      throw new Error(NOT_IMPLEMENTED)
    }
    // Lending has near-zero slippage — spot deposit
    return 1
  }

  async deposit(_amount: bigint, _params?: Record<string, unknown>): Promise<TxSignature> {
    if (!this.config.mockMode) {
      throw new Error(NOT_IMPLEMENTED)
    }
    return `mock-tx-drift-lending-deposit-${Date.now()}`
  }

  async withdraw(_amount: bigint): Promise<TxSignature> {
    if (!this.config.mockMode) {
      throw new Error(NOT_IMPLEMENTED)
    }
    return `mock-tx-drift-lending-withdraw-${Date.now()}`
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
