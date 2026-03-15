// Risk levels — first-class enum, flows through every layer
export const RISK_LEVELS = ['conservative', 'moderate', 'aggressive'] as const
export type RiskLevel = (typeof RISK_LEVELS)[number]

export function isValidRiskLevel(value: unknown): value is RiskLevel {
  return typeof value === 'string' && RISK_LEVELS.includes(value as RiskLevel)
}

// Asset identifier
export type Asset = 'USDC' | 'SOL' | 'BTC' | 'ETH' | 'JitoSOL'

// Yield estimate returned by backends
export interface YieldEstimate {
  annualizedApy: number        // as decimal (0.15 = 15%)
  source: string               // backend name
  asset: Asset
  confidence: number           // 0-1 how reliable this estimate is
  timestamp: number            // unix ms
  metadata?: Record<string, unknown>
}

// Risk metrics returned by backends
export interface RiskMetrics {
  volatilityScore: number      // 0-1 normalized stdev of hourly returns (7d lookback)
  maxDrawdown: number          // worst historical drawdown as decimal
  liquidationRisk: LiquidationRisk
  correlationToMarket: number  // -1 to 1
  metadata?: Record<string, unknown>
}

export type LiquidationRisk = 'none' | 'low' | 'medium' | 'high'

// Position state for a single backend
export interface PositionState {
  backend: string
  asset: Asset
  depositedAmount: bigint      // in base units (USDC = 6 decimals)
  currentValue: bigint         // current value in USDC base units
  unrealizedPnl: bigint        // signed
  entryTimestamp: number       // unix ms
  isActive: boolean
  metadata?: Record<string, unknown>
}

// Transaction signature (Solana)
export type TxSignature = string

// Weight proposal from keeper to allocator
export interface WeightProposal {
  weights: Record<string, number>      // backend name → allocation percentage (0-100, must sum to 100)
  riskLevel: RiskLevel
  algoScores: Record<string, number>   // backend name → risk-adjusted score
  aiReasoning?: string
  aiConfidence?: number                // 0-1
  timestamp: number
}

// Rebalance result from allocator
export interface RebalanceResult {
  status: 'executed' | 'rejected' | 'partial'
  previousWeights: Record<string, number>
  newWeights: Record<string, number>
  guardrailViolations: string[]
  txSignature?: TxSignature
  timestamp: number
}

// Guardrail configuration per risk tier
export interface GuardrailConfig {
  maxPerStrategyAllocation: Record<string, number>  // strategy → max %
  maxDrawdown: number                               // as decimal (0.05 = 5%)
  maxLeverage: number
  maxSingleAssetConcentration: number               // as decimal
  minRebalanceIntervalMs: number
  maxAllocationShiftPerRebalance: number            // max % change per rebalance
  redemptionPeriodMs: number
}
