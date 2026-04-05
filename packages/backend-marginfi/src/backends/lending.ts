import type {
  YieldBackend,
  BackendCapabilities,
  YieldEstimate,
  RiskMetrics,
  PositionState,
  TxSignature,
} from '@nanuqfi/core'

export interface MarginfiLendingConfig {
  mockApy?: number
  mockVolatility?: number
}

/**
 * Marginfi USDC lending backend — stub implementation.
 *
 * Proves protocol-agnostic architecture by implementing the same YieldBackend
 * interface as Drift backends. Uses realistic mock yields sourced from DeFi Llama
 * historical data for Marginfi USDC lending pools.
 *
 * When Marginfi SDK integration is ready, replace mock methods with real CPI calls.
 */
export class MarginfiLendingBackend implements YieldBackend {
  readonly name = 'marginfi-lending'

  readonly capabilities: BackendCapabilities = {
    supportedAssets: ['USDC'],
    supportsLeverage: false,
    maxLeverage: 1,
    isDeltaNeutral: false,
    hasAutoExit: false,
    liquidationRisk: 'none',
    minDeposit: 1_000_000n,          // 1 USDC (6 decimals)
    maxDeposit: 50_000_000_000n,     // 50,000 USDC
    withdrawalDelay: 0,
    features: ['marginfi-lending', 'solana-native'],
  }

  private readonly mockApy: number
  private readonly mockVolatility: number
  private deposited = 0n
  private active = false

  constructor(config: MarginfiLendingConfig = {}) {
    // Realistic Marginfi USDC lending APY from DeFi Llama historical data
    this.mockApy = config.mockApy ?? 0.065
    this.mockVolatility = config.mockVolatility ?? 0.04
  }

  async getExpectedYield(): Promise<YieldEstimate> {
    return {
      annualizedApy: this.mockApy,
      source: this.name,
      asset: 'USDC',
      confidence: 0.88,
      timestamp: Date.now(),
      metadata: { mode: 'mock', protocol: 'marginfi' },
    }
  }

  async getRisk(): Promise<RiskMetrics> {
    return {
      volatilityScore: this.mockVolatility,
      maxDrawdown: 0.005,
      liquidationRisk: 'none',
      correlationToMarket: 0.15,
      metadata: { mode: 'mock', protocol: 'marginfi' },
    }
  }

  async estimateSlippage(_amount: bigint): Promise<number> {
    return 2 // 2 bps — lending has near-zero slippage
  }

  async deposit(amount: bigint, _params?: Record<string, unknown>): Promise<TxSignature> {
    this.deposited += amount
    this.active = true
    return `mock-tx-marginfi-lending-deposit-${Date.now()}`
  }

  async withdraw(amount: bigint): Promise<TxSignature> {
    this.deposited -= amount
    if (this.deposited <= 0n) {
      this.deposited = 0n
      this.active = false
    }
    return `mock-tx-marginfi-lending-withdraw-${Date.now()}`
  }

  async getPosition(): Promise<PositionState> {
    return {
      backend: this.name,
      asset: 'USDC',
      depositedAmount: this.deposited,
      currentValue: this.deposited,
      unrealizedPnl: 0n,
      entryTimestamp: this.active ? Date.now() : 0,
      isActive: this.active,
      metadata: { mode: 'mock', protocol: 'marginfi' },
    }
  }
}
