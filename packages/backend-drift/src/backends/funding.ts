import type {
  YieldBackend,
  BackendCapabilities,
  YieldEstimate,
  RiskMetrics,
  PositionState,
  TxSignature,
  RiskLevel,
} from '@nanuqfi/core'
import type { DriftClient } from '@drift-labs/sdk'
import { BN } from '@coral-xyz/anchor'
import { fetchFundingRates, parseFundingRate } from '../utils/drift-data-api'

export interface DriftFundingConfig {
  mockMode?: boolean
  mockApy?: number
  mockVolatility?: number
  driftClient?: DriftClient
}

const USDC_MARKET_INDEX = 0

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

  private readonly mockConfig: { mockMode: boolean; mockApy: number; mockVolatility: number }
  private readonly driftClient?: DriftClient

  constructor(config: DriftFundingConfig = {}) {
    this.mockConfig = {
      mockMode: config.mockMode ?? false,
      mockApy: config.mockApy ?? 0.30,
      mockVolatility: config.mockVolatility ?? 0.35,
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
    if (this.isMockMode) {
      return {
        annualizedApy: this.mockConfig.mockApy,
        source: this.name,
        asset: 'USDC',
        confidence: 0.75,
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
      confidence: 0.75,
      timestamp: Date.now(),
      metadata: { mode: 'real', fundingRate: latest.hourlyRate },
    }
  }

  async getRisk(): Promise<RiskMetrics> {
    if (this.isMockMode) {
      return {
        volatilityScore: this.mockConfig.mockVolatility,
        maxDrawdown: 0.08,
        liquidationRisk: 'medium',
        correlationToMarket: 0.45,
        metadata: { mode: 'mock' },
      }
    }
    this.requireDriftClient()
    // Directional perp — static high-risk profile
    return {
      volatilityScore: 0.35,
      maxDrawdown: 0.08,
      liquidationRisk: 'medium' as const,
      correlationToMarket: 0.45,
      metadata: { mode: 'real' },
    }
  }

  async estimateSlippage(_amount: bigint): Promise<number> {
    if (this.isMockMode) return 10
    // Leveraged perp — higher slippage risk
    return 10
  }

  async deposit(amount: bigint, _params?: Record<string, unknown>): Promise<TxSignature> {
    if (this.isMockMode) return `mock-tx-drift-funding-deposit-${Date.now()}`
    const dc = this.requireDriftClient()
    const bnAmount = dc.convertToSpotPrecision(USDC_MARKET_INDEX, Number(amount) / 1e6)
    const ata = await dc.getAssociatedTokenAccount(USDC_MARKET_INDEX)
    const txSig = await dc.deposit(bnAmount, USDC_MARKET_INDEX, ata)
    // Perp position opening is deferred to keeper (trading delegate)
    return txSig
  }

  async withdraw(amount: bigint): Promise<TxSignature> {
    if (this.isMockMode) return `mock-tx-drift-funding-withdraw-${Date.now()}`
    const dc = this.requireDriftClient()
    const bnAmount = dc.convertToSpotPrecision(USDC_MARKET_INDEX, Number(amount) / 1e6)
    const ata = await dc.getAssociatedTokenAccount(USDC_MARKET_INDEX)
    // Perp closure deferred to keeper (trading delegate)
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
