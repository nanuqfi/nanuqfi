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
import { fetchDepositRate } from '../utils/drift-data-api'

export interface DriftLendingConfig {
  mockMode?: boolean
  mockApy?: number
  mockVolatility?: number
  driftClient?: DriftClient
}

const USDC_MARKET_INDEX = 0

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

  private readonly mockConfig: { mockMode: boolean; mockApy: number; mockVolatility: number }
  private readonly driftClient?: DriftClient

  constructor(config: DriftLendingConfig = {}) {
    this.mockConfig = {
      mockMode: config.mockMode ?? false,
      mockApy: config.mockApy ?? 0.08,
      mockVolatility: config.mockVolatility ?? 0.05,
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

  async getExpectedYield(): Promise<YieldEstimate> {
    if (this.isMockMode) {
      return {
        annualizedApy: this.mockConfig.mockApy,
        source: this.name,
        asset: 'USDC',
        confidence: 0.92,
        timestamp: Date.now(),
        metadata: { mode: 'mock' },
      }
    }
    this.requireDriftClient()
    const rate = await fetchDepositRate(USDC_MARKET_INDEX)
    return {
      annualizedApy: rate,
      source: this.name,
      asset: 'USDC',
      confidence: 0.92,
      timestamp: Date.now(),
      metadata: { mode: 'real' },
    }
  }

  async getRisk(): Promise<RiskMetrics> {
    if (this.isMockMode) {
      return {
        volatilityScore: this.mockConfig.mockVolatility,
        maxDrawdown: 0.01,
        liquidationRisk: 'none',
        correlationToMarket: 0.1,
        metadata: { mode: 'mock' },
      }
    }
    this.requireDriftClient()
    // Lending has static low risk — no complex calculation needed
    return {
      volatilityScore: 0.05,
      maxDrawdown: 0.01,
      liquidationRisk: 'none' as const,
      correlationToMarket: 0.1,
      metadata: { mode: 'real' },
    }
  }

  async estimateSlippage(_amount: bigint): Promise<number> {
    if (this.isMockMode) return 1
    // Lending = spot deposit, near-zero slippage
    return 1
  }

  async deposit(amount: bigint, _params?: Record<string, unknown>): Promise<TxSignature> {
    if (this.isMockMode) return `mock-tx-drift-lending-deposit-${Date.now()}`
    const dc = this.requireDriftClient()
    const bnAmount = dc.convertToSpotPrecision(USDC_MARKET_INDEX, Number(amount) / 1e6)
    const ata = await dc.getAssociatedTokenAccount(USDC_MARKET_INDEX)
    const txSig = await dc.deposit(bnAmount, USDC_MARKET_INDEX, ata)
    return txSig
  }

  async withdraw(amount: bigint): Promise<TxSignature> {
    if (this.isMockMode) return `mock-tx-drift-lending-withdraw-${Date.now()}`
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
      unrealizedPnl: 0n, // Lending has no unrealized PnL
      entryTimestamp: 0,
      isActive: spotPosition ? spotPosition.scaledBalance.gt(new BN(0)) : false,
      metadata: { mode: 'real' },
    }
  }
}
