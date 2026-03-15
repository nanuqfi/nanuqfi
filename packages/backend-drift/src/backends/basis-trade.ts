import type {
  YieldBackend,
  BackendCapabilities,
  YieldEstimate,
  RiskMetrics,
  PositionState,
  TxSignature,
} from '@nanuqfi/core'
import type { DriftClient } from '@drift-labs/sdk'
import { BN } from '@coral-xyz/anchor'
import { fetchFundingRates, parseFundingRate } from '../utils/drift-data-api'

export interface DriftBasisTradeConfig {
  mockMode?: boolean
  mockApy?: number
  mockVolatility?: number
  /**
   * Number of consecutive negative funding periods to trigger auto-exit.
   * Each period = 15 minutes. Default: 16 (= 4 hours).
   */
  negativeFundingPeriods?: number
  driftClient?: DriftClient
}

const USDC_MARKET_INDEX = 0

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

  private readonly mockConfig: { mockMode: boolean; mockApy: number; mockVolatility: number; negativeFundingPeriods: number }
  private readonly driftClient?: DriftClient

  constructor(config: DriftBasisTradeConfig = {}) {
    this.mockConfig = {
      mockMode: config.mockMode ?? false,
      mockApy: config.mockApy ?? 0.20,
      mockVolatility: config.mockVolatility ?? 0.2,
      negativeFundingPeriods: config.negativeFundingPeriods ?? 16,
    }
    this.driftClient = config.driftClient
  }

  private get isMockMode(): boolean {
    return this.mockConfig.mockMode
  }

  private requireDriftClient(): DriftClient {
    if (!this.driftClient) {
      throw new Error('DriftClient required for real mode')
    }
    return this.driftClient
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
    const requiredPeriods = this.mockConfig.negativeFundingPeriods
    if (fundingHistory.length < requiredPeriods) {
      return false
    }
    const tail = fundingHistory.slice(-requiredPeriods)
    return tail.every((rate) => rate < 0)
  }

  async getExpectedYield(): Promise<YieldEstimate> {
    if (this.isMockMode) {
      return {
        annualizedApy: this.mockConfig.mockApy,
        source: this.name,
        asset: 'USDC',
        confidence: 0.80,
        timestamp: Date.now(),
        metadata: { mode: 'mock' },
      }
    }
    this.requireDriftClient()
    const rates = await fetchFundingRates('SOL-PERP')
    if (rates.length === 0) {
      return {
        annualizedApy: 0,
        source: this.name,
        asset: 'USDC',
        confidence: 0.5,
        timestamp: Date.now(),
        metadata: { mode: 'real' },
      }
    }
    const latest = parseFundingRate(rates[rates.length - 1]!)
    return {
      annualizedApy: latest.annualizedApr / 100,
      source: this.name,
      asset: 'USDC',
      confidence: 0.80,
      timestamp: Date.now(),
      metadata: { mode: 'real', fundingRate: latest.hourlyRate },
    }
  }

  async getRisk(): Promise<RiskMetrics> {
    if (this.isMockMode) {
      return {
        volatilityScore: this.mockConfig.mockVolatility,
        maxDrawdown: 0.04,
        liquidationRisk: 'low',
        correlationToMarket: 0.05,
        metadata: { mode: 'mock' },
      }
    }
    this.requireDriftClient()
    return {
      volatilityScore: 0.2,
      maxDrawdown: 0.04,
      liquidationRisk: 'low' as const,
      correlationToMarket: 0.05,
      metadata: { mode: 'real' },
    }
  }

  async estimateSlippage(_amount: bigint): Promise<number> {
    if (this.isMockMode) return 5
    // Basis trade involves perp leg — higher slippage than lending
    return 5
  }

  async deposit(amount: bigint, _params?: Record<string, unknown>): Promise<TxSignature> {
    if (this.isMockMode) return `mock-tx-drift-basis-deposit-${Date.now()}`
    const dc = this.requireDriftClient()
    const bnAmount = dc.convertToSpotPrecision(USDC_MARKET_INDEX, Number(amount) / 1e6)
    const ata = await dc.getAssociatedTokenAccount(USDC_MARKET_INDEX)
    const txSig = await dc.deposit(bnAmount, USDC_MARKET_INDEX, ata)
    // TODO: Open perp short leg (requires DLOB server for makers)
    // For now, collateral is deposited; keeper handles perp as trading delegate
    return txSig
  }

  async withdraw(amount: bigint): Promise<TxSignature> {
    if (this.isMockMode) return `mock-tx-drift-basis-withdraw-${Date.now()}`
    const dc = this.requireDriftClient()
    const bnAmount = dc.convertToSpotPrecision(USDC_MARKET_INDEX, Number(amount) / 1e6)
    const ata = await dc.getAssociatedTokenAccount(USDC_MARKET_INDEX)
    // TODO: Close perp short first, then withdraw collateral
    // For now, withdraw collateral; keeper handles perp closure as trading delegate
    const txSig = await dc.withdraw(bnAmount, USDC_MARKET_INDEX, ata)
    return txSig
  }

  async getPosition(): Promise<PositionState> {
    if (this.isMockMode) {
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
    const dc = this.requireDriftClient()
    const user = dc.getUser()
    const spotPosition = user.getSpotPosition(USDC_MARKET_INDEX)
    return {
      backend: this.name,
      asset: 'USDC',
      depositedAmount: spotPosition ? BigInt(spotPosition.scaledBalance.toString()) : 0n,
      currentValue: spotPosition ? BigInt(spotPosition.scaledBalance.toString()) : 0n,
      unrealizedPnl: 0n,
      entryTimestamp: 0,
      isActive: spotPosition ? spotPosition.scaledBalance.gt(new BN(0)) : false,
      metadata: { mode: 'real' },
    }
  }
}
