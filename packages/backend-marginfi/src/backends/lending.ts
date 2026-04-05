import type {
  YieldBackend,
  BackendCapabilities,
  YieldEstimate,
  RiskMetrics,
  PositionState,
  TxSignature,
} from '@nanuqfi/core'
import type { MarginfiClientLike } from '../utils/marginfi-data-api'
import { fetchLendingRate, fetchBankMetrics } from '../utils/marginfi-data-api'

export interface MarginfiLendingConfig {
  mockMode?: boolean
  mockApy?: number
  mockVolatility?: number
  marginfiClient?: MarginfiClientLike
}

/**
 * Marginfi USDC lending backend.
 *
 * Mock mode: deterministic returns for unit tests (default).
 * Real mode: live on-chain data from Marginfi banks via MarginfiClient.
 *
 * deposit()/withdraw() are stubs in both modes — actual capital movement
 * is handled by the on-chain allocator program via CPI.
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

  private readonly mockConfig: { mockMode: boolean; mockApy: number; mockVolatility: number }
  private readonly marginfiClient?: MarginfiClientLike
  private deposited = 0n
  private active = false

  constructor(config: MarginfiLendingConfig = {}) {
    const mockMode = config.mockMode ?? true

    if (!mockMode && !config.marginfiClient) {
      throw new Error('MarginfiClient required for real mode')
    }

    this.mockConfig = {
      mockMode,
      mockApy: config.mockApy ?? 0.065,
      mockVolatility: config.mockVolatility ?? 0.04,
    }
    this.marginfiClient = config.marginfiClient
  }

  private get isMockMode(): boolean {
    return this.mockConfig.mockMode
  }

  private requireClient(): MarginfiClientLike {
    if (!this.marginfiClient) {
      throw new Error('MarginfiClient required for real mode')
    }
    return this.marginfiClient
  }

  async getExpectedYield(): Promise<YieldEstimate> {
    if (this.isMockMode) {
      return {
        annualizedApy: this.mockConfig.mockApy,
        source: this.name,
        asset: 'USDC',
        confidence: 0.88,
        timestamp: Date.now(),
        metadata: { mode: 'mock', protocol: 'marginfi' },
      }
    }

    const client = this.requireClient()
    const rate = fetchLendingRate(client, 'USDC')

    return {
      annualizedApy: rate,
      source: this.name,
      asset: 'USDC',
      confidence: 0.92,
      timestamp: Date.now(),
      metadata: { mode: 'real', protocol: 'marginfi' },
    }
  }

  async getRisk(): Promise<RiskMetrics> {
    if (this.isMockMode) {
      return {
        volatilityScore: this.mockConfig.mockVolatility,
        maxDrawdown: 0.005,
        liquidationRisk: 'none',
        correlationToMarket: 0.15,
        metadata: { mode: 'mock', protocol: 'marginfi' },
      }
    }

    const client = this.requireClient()
    const metrics = fetchBankMetrics(client, 'USDC')

    // Higher utilization = higher volatility risk (rates fluctuate more)
    const volatilityScore = 0.02 + metrics.utilization * 0.08

    return {
      volatilityScore,
      maxDrawdown: 0.005,
      liquidationRisk: 'none',
      correlationToMarket: 0.15,
      metadata: {
        mode: 'real',
        protocol: 'marginfi',
        utilization: metrics.utilization,
      },
    }
  }

  async estimateSlippage(amount: bigint): Promise<number> {
    if (this.isMockMode) return 2

    const client = this.requireClient()
    const metrics = fetchBankMetrics(client, 'USDC')

    // If withdrawal amount exceeds 10% of available liquidity, slippage increases
    const amountNum = Number(amount)
    const ratio = amountNum / metrics.availableLiquidity
    if (ratio > 0.1) return 10   // 10 bps for large withdrawals
    if (ratio > 0.01) return 5   // 5 bps for medium
    return 2                     // 2 bps baseline
  }

  async deposit(amount: bigint, _params?: Record<string, unknown>): Promise<TxSignature> {
    if (this.isMockMode) {
      this.deposited += amount
      this.active = true
      return `mock-tx-marginfi-lending-deposit-${Date.now()}`
    }

    // Real mode: stub — allocator program handles actual deposits via CPI
    this.deposited += amount
    this.active = true
    return `pending-allocator-cpi-deposit-${Date.now()}`
  }

  async withdraw(amount: bigint): Promise<TxSignature> {
    if (this.isMockMode) {
      this.deposited -= amount
      if (this.deposited <= 0n) {
        this.deposited = 0n
        this.active = false
      }
      return `mock-tx-marginfi-lending-withdraw-${Date.now()}`
    }

    // Real mode: stub — allocator program handles actual withdrawals via CPI
    this.deposited -= amount
    if (this.deposited <= 0n) {
      this.deposited = 0n
      this.active = false
    }
    return `pending-allocator-cpi-withdraw-${Date.now()}`
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
      metadata: {
        mode: this.isMockMode ? 'mock' : 'real',
        protocol: 'marginfi',
      },
    }
  }
}
