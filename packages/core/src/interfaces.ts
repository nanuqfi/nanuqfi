import type {
  Asset,
  LiquidationRisk,
  YieldEstimate,
  RiskMetrics,
  PositionState,
  TxSignature,
} from './types'

export interface BackendCapabilities {
  supportedAssets: Asset[]
  supportsLeverage: boolean
  maxLeverage: number
  isDeltaNeutral: boolean
  hasAutoExit: boolean
  liquidationRisk: LiquidationRisk
  minDeposit: bigint
  maxDeposit: bigint
  withdrawalDelay: number     // seconds, 0 = instant
  features?: string[]         // metadata escape hatch
}

export interface YieldBackend {
  readonly name: string
  readonly capabilities: BackendCapabilities

  getExpectedYield(): Promise<YieldEstimate>
  getRisk(): Promise<RiskMetrics>
  estimateSlippage(amount: bigint): Promise<number>  // returns basis points
  deposit(amount: bigint, params?: Record<string, unknown>): Promise<TxSignature>
  withdraw(amount: bigint): Promise<TxSignature>
  getPosition(): Promise<PositionState>
}
