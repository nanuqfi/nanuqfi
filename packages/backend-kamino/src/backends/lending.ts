import type {
  YieldBackend,
  BackendCapabilities,
  YieldEstimate,
  RiskMetrics,
  PositionState,
  TxSignature,
} from '@nanuqfi/core'
import { fetchUsdcReserveMetrics } from '../utils/kamino-api'

export interface KaminoLendingConfig {
  mockMode?: boolean
  mockApy?: number
  mockVolatility?: number
  apiBaseUrl?: string
}

/**
 * Kamino USDC lending backend.
 *
 * Mock mode: deterministic returns for unit tests (default).
 * Real mode: live rates from api.kamino.finance — zero SDK dependency, pure HTTP.
 *
 * deposit()/withdraw() are stubs in both modes — actual capital movement
 * is handled by the on-chain allocator program via CPI.
 */
export class KaminoLendingBackend implements YieldBackend {
  readonly name = 'kamino-lending'

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
    features: ['kamino-lending', 'solana-native'],
  }

  private readonly mockConfig: { mockMode: boolean; mockApy: number; mockVolatility: number }
  private readonly apiBaseUrl: string
  private deposited = 0n
  private active = false

  constructor(config: KaminoLendingConfig = {}) {
    this.mockConfig = {
      mockMode: config.mockMode ?? true,
      mockApy: config.mockApy ?? 0.045,
      mockVolatility: config.mockVolatility ?? 0.03,
    }
    this.apiBaseUrl = config.apiBaseUrl ?? 'https://api.kamino.finance'
  }

  private get isMockMode(): boolean {
    return this.mockConfig.mockMode
  }

  async getExpectedYield(): Promise<YieldEstimate> {
    if (this.isMockMode) {
      return {
        annualizedApy: this.mockConfig.mockApy,
        source: this.name,
        asset: 'USDC',
        confidence: 0.90,
        timestamp: Date.now(),
        metadata: { mode: 'mock', protocol: 'kamino' },
      }
    }

    const metrics = await fetchUsdcReserveMetrics(this.apiBaseUrl)
    return {
      annualizedApy: metrics.supplyApy,
      source: this.name,
      asset: 'USDC',
      confidence: 0.93,
      timestamp: Date.now(),
      metadata: { mode: 'real', protocol: 'kamino' },
    }
  }

  async getRisk(): Promise<RiskMetrics> {
    if (this.isMockMode) {
      return {
        volatilityScore: this.mockConfig.mockVolatility,
        maxDrawdown: 0.003,
        liquidationRisk: 'none',
        correlationToMarket: 0.12,
        metadata: { mode: 'mock', protocol: 'kamino' },
      }
    }

    const metrics = await fetchUsdcReserveMetrics(this.apiBaseUrl)
    // Higher utilization = higher rate volatility risk
    const volatilityScore = 0.02 + metrics.utilization * 0.08

    return {
      volatilityScore,
      maxDrawdown: 0.003,
      liquidationRisk: 'none',
      correlationToMarket: 0.12,
      metadata: { mode: 'real', protocol: 'kamino', utilization: metrics.utilization },
    }
  }

  async estimateSlippage(amount: bigint): Promise<number> {
    if (this.isMockMode) return 2

    const metrics = await fetchUsdcReserveMetrics(this.apiBaseUrl)
    const amountUsd = Number(amount) / 1e6
    const ratio = amountUsd / metrics.availableLiquidityUsd
    if (ratio > 0.1) return 10   // 10 bps for very large withdrawals
    if (ratio > 0.01) return 5   // 5 bps for medium
    return 2                     // 2 bps baseline
  }

  async deposit(amount: bigint, _params?: Record<string, unknown>): Promise<TxSignature> {
    this.deposited += amount
    this.active = true
    if (this.isMockMode) return `mock-tx-kamino-lending-deposit-${Date.now()}`
    // Real mode: stub — allocator program handles actual deposits via CPI
    return `pending-allocator-cpi-deposit-${Date.now()}`
  }

  async withdraw(amount: bigint): Promise<TxSignature> {
    this.deposited -= amount
    if (this.deposited <= 0n) {
      this.deposited = 0n
      this.active = false
    }
    if (this.isMockMode) return `mock-tx-kamino-lending-withdraw-${Date.now()}`
    // Real mode: stub — allocator program handles actual withdrawals via CPI
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
      metadata: { mode: this.isMockMode ? 'mock' : 'real', protocol: 'kamino' },
    }
  }
}
