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
import { fetchBorrowRate } from '../utils/drift-data-api'

export interface DriftJitoDNConfig {
  mockMode?: boolean
  mockApy?: number
  mockVolatility?: number
  driftClient?: DriftClient
}

const USDC_MARKET_INDEX = 0
const SOL_MARKET_INDEX = 1

// Approximate JitoSOL staking yield — Jito API integration comes later
const JITOSOL_ESTIMATED_YIELD = 0.07

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

  private readonly mockConfig: { mockMode: boolean; mockApy: number; mockVolatility: number }
  private readonly driftClient?: DriftClient

  constructor(config: DriftJitoDNConfig = {}) {
    this.mockConfig = {
      mockMode: config.mockMode ?? false,
      mockApy: config.mockApy ?? 0.22,
      mockVolatility: config.mockVolatility ?? 0.18,
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
   * Returns true when the carry trade has inverted — i.e., SOL borrow cost has
   * reached or exceeded the JitoSOL staking yield, eliminating (or reversing) profit.
   *
   * Strategy: hold JitoSOL (earn staking yield) + short SOL via Drift borrow
   * (pay borrow rate). Profitable only while jitoStakingYield > solBorrowRate.
   *
   * Pure math function — works in both mock and real mode.
   *
   * @param solBorrowRate    - Annualized borrow rate for SOL on Drift (decimal)
   * @param jitoStakingYield - Annualized JitoSOL staking yield (decimal)
   */
  shouldAutoExit(solBorrowRate: number, jitoStakingYield: number): boolean {
    return solBorrowRate >= jitoStakingYield
  }

  async getExpectedYield(): Promise<YieldEstimate> {
    if (this.isMockMode) {
      return {
        annualizedApy: this.mockConfig.mockApy,
        source: this.name,
        asset: 'USDC',
        confidence: 0.82,
        timestamp: Date.now(),
        metadata: { mode: 'mock' },
      }
    }
    this.requireDriftClient()
    // yield = estimated JitoSOL staking yield - SOL borrow rate
    const solBorrowRate = await fetchBorrowRate(SOL_MARKET_INDEX)
    const netYield = JITOSOL_ESTIMATED_YIELD - solBorrowRate
    return {
      annualizedApy: Math.max(netYield, 0),
      source: this.name,
      asset: 'USDC',
      confidence: 0.82,
      timestamp: Date.now(),
      metadata: { mode: 'real', jitoYield: JITOSOL_ESTIMATED_YIELD, solBorrowRate },
    }
  }

  async getRisk(): Promise<RiskMetrics> {
    if (this.isMockMode) {
      return {
        volatilityScore: this.mockConfig.mockVolatility,
        maxDrawdown: 0.03,
        liquidationRisk: 'low',
        correlationToMarket: 0.15,
        metadata: { mode: 'mock' },
      }
    }
    this.requireDriftClient()
    // Static medium-risk profile for delta-neutral JitoSOL strategy
    return {
      volatilityScore: 0.18,
      maxDrawdown: 0.03,
      liquidationRisk: 'low' as const,
      correlationToMarket: 0.15,
      metadata: { mode: 'real' },
    }
  }

  async estimateSlippage(_amount: bigint): Promise<number> {
    if (this.isMockMode) return 3
    // Medium slippage — spot deposit + perp hedge
    return 3
  }

  async deposit(amount: bigint, _params?: Record<string, unknown>): Promise<TxSignature> {
    if (this.isMockMode) return `mock-tx-drift-jito-dn-deposit-${Date.now()}`
    // Deposit USDC collateral — keeper handles JitoSOL swap + perp hedge as trading delegate
    const dc = this.requireDriftClient()
    const bnAmount = dc.convertToSpotPrecision(USDC_MARKET_INDEX, Number(amount) / 1e6)
    const ata = await dc.getAssociatedTokenAccount(USDC_MARKET_INDEX)
    const txSig = await dc.deposit(bnAmount, USDC_MARKET_INDEX, ata)
    return txSig
  }

  async withdraw(amount: bigint): Promise<TxSignature> {
    if (this.isMockMode) return `mock-tx-drift-jito-dn-withdraw-${Date.now()}`
    // Withdraw USDC collateral — keeper handles perp closure + JitoSOL → USDC conversion
    const dc = this.requireDriftClient()
    const bnAmount = dc.convertToSpotPrecision(USDC_MARKET_INDEX, Number(amount) / 1e6)
    const ata = await dc.getAssociatedTokenAccount(USDC_MARKET_INDEX)
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
