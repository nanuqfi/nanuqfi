import type {
  YieldBackend,
  BackendCapabilities,
  YieldEstimate,
  RiskMetrics,
  PositionState,
  TxSignature,
} from '@nanuqfi/core'
import { fetchLuloRates, fetchLuloPoolData } from '../utils/lulo-api'

export interface LuloLendingConfig {
  /** Use deterministic mock returns — default true */
  mockMode?: boolean
  /** Mock APY override — default 0.07 (7%, Lulo's average across protocols) */
  mockApy?: number
  /** Mock volatility score — default 0.02 */
  mockVolatility?: number
  /** Required when mockMode: false */
  apiKey?: string
  /** Default: 'https://api.lulo.fi' */
  apiBaseUrl?: string
}

/**
 * Lulo USDC lending backend.
 *
 * Lulo is a lending aggregator on Solana — it routes deposits across
 * Kamino, Drift, MarginFi, and Jupiter to the highest-yielding protocol.
 * This yields the highest available lending rate with diversified protocol risk.
 *
 * Mock mode: deterministic returns for unit tests (default).
 * Real mode: live rates from api.lulo.fi — zero SDK dependency, pure HTTP.
 *
 * deposit()/withdraw() are stubs in both modes — actual capital movement
 * is handled by the on-chain allocator program via CPI.
 */
export class LuloLendingBackend implements YieldBackend {
  readonly name = 'lulo-lending'

  readonly capabilities: BackendCapabilities = {
    supportedAssets: ['USDC'],
    supportsLeverage: false,
    maxLeverage: 1,
    isDeltaNeutral: false,
    hasAutoExit: false,
    liquidationRisk: 'none',
    minDeposit: 1_000_000n,           // 1 USDC (6 decimals)
    maxDeposit: 50_000_000_000n,      // 50,000 USDC
    withdrawalDelay: 0,
    features: ['lulo-aggregator', 'solana-native', 'multi-protocol'],
  }

  private readonly mockConfig: { mockMode: boolean; mockApy: number; mockVolatility: number }
  private readonly apiKey: string
  private readonly apiBaseUrl: string
  private deposited = 0n
  private active = false

  constructor(config: LuloLendingConfig = {}) {
    const mockMode = config.mockMode ?? true

    if (!mockMode && !config.apiKey) {
      throw new Error('LULO_API_KEY required for real mode')
    }

    this.mockConfig = {
      mockMode,
      mockApy: config.mockApy ?? 0.07,
      mockVolatility: config.mockVolatility ?? 0.02,
    }
    this.apiKey = config.apiKey ?? ''
    this.apiBaseUrl = config.apiBaseUrl ?? 'https://api.lulo.fi'
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
        metadata: { mode: 'mock', protocol: 'lulo' },
      }
    }

    const rates = await fetchLuloRates(this.apiKey, this.apiBaseUrl)
    return {
      annualizedApy: rates.regularApy,
      source: this.name,
      asset: 'USDC',
      confidence: 0.92,
      timestamp: Date.now(),
      metadata: { mode: 'real', protocol: 'lulo' },
    }
  }

  async getRisk(): Promise<RiskMetrics> {
    if (this.isMockMode) {
      return {
        volatilityScore: this.mockConfig.mockVolatility,
        maxDrawdown: 0.002,
        liquidationRisk: 'none',
        correlationToMarket: 0.08,
        metadata: { mode: 'mock', protocol: 'lulo' },
      }
    }

    const pool = await fetchLuloPoolData(this.apiKey, this.apiBaseUrl)

    // Lulo diversifies across protocols — utilization measures overall pool pressure.
    // Low utilization = low rate volatility risk.
    const utilization =
      pool.totalLiquidity > 0
        ? 1 - pool.availableLiquidity / pool.totalLiquidity
        : 0

    // Very low risk since Lulo auto-routes to best protocol; utilization multiplier is minimal.
    const volatilityScore = 0.01 + utilization * 0.03

    return {
      volatilityScore,
      maxDrawdown: 0.002,
      liquidationRisk: 'none',
      correlationToMarket: 0.08,
      metadata: { mode: 'real', protocol: 'lulo', utilization },
    }
  }

  async estimateSlippage(amount: bigint): Promise<number> {
    if (this.isMockMode) return 1   // 1 bps — Lulo has deep aggregated liquidity

    const pool = await fetchLuloPoolData(this.apiKey, this.apiBaseUrl)
    const amountUsd = Number(amount) / 1e6
    const ratio = pool.availableLiquidity > 0 ? amountUsd / pool.availableLiquidity : 1

    if (ratio > 0.1) return 8    // 8 bps for very large withdrawals
    if (ratio > 0.01) return 3   // 3 bps for medium
    return 1                     // 1 bps baseline — best in class
  }

  async deposit(amount: bigint, _params?: Record<string, unknown>): Promise<TxSignature> {
    this.deposited += amount
    this.active = true
    if (this.isMockMode) return `mock-tx-lulo-lending-deposit-${Date.now()}`
    // Real mode: stub — allocator program handles actual deposits via CPI
    return `pending-allocator-cpi-deposit-${Date.now()}`
  }

  async withdraw(amount: bigint): Promise<TxSignature> {
    this.deposited -= amount
    if (this.deposited <= 0n) {
      this.deposited = 0n
      this.active = false
    }
    if (this.isMockMode) return `mock-tx-lulo-lending-withdraw-${Date.now()}`
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
      metadata: { mode: this.isMockMode ? 'mock' : 'real', protocol: 'lulo' },
    }
  }
}
