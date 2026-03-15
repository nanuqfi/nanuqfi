import type { BackendCapabilities, YieldBackend } from '../interfaces'
import type { YieldEstimate, RiskMetrics, PositionState } from '../types'

export class MockYieldBackend implements YieldBackend {
  readonly name: string
  readonly capabilities: BackendCapabilities

  private _yield: YieldEstimate
  private _risk: RiskMetrics
  private _position: PositionState
  private _slippageBps: number
  private _shouldFail: boolean

  constructor(
    name: string,
    capabilitiesOverrides: Partial<BackendCapabilities> = {},
    options: {
      apy?: number
      volatility?: number
      slippageBps?: number
      shouldFail?: boolean
    } = {},
  ) {
    this.name = name
    this.capabilities = {
      supportedAssets: ['USDC'],
      supportsLeverage: false,
      maxLeverage: 1,
      isDeltaNeutral: false,
      hasAutoExit: false,
      liquidationRisk: 'none',
      minDeposit: 1_000_000n,
      maxDeposit: 1_000_000_000_000n,
      withdrawalDelay: 0,
      ...capabilitiesOverrides,
    }

    this._slippageBps = options.slippageBps ?? 5
    this._shouldFail = options.shouldFail ?? false

    this._yield = {
      annualizedApy: options.apy ?? 0.10,
      source: name,
      asset: 'USDC',
      confidence: 0.9,
      timestamp: Date.now(),
    }

    this._risk = {
      volatilityScore: options.volatility ?? 0.1,
      maxDrawdown: 0.02,
      liquidationRisk: this.capabilities.liquidationRisk,
      correlationToMarket: 0.3,
    }

    this._position = {
      backend: name,
      asset: 'USDC',
      depositedAmount: 0n,
      currentValue: 0n,
      unrealizedPnl: 0n,
      entryTimestamp: 0,
      isActive: false,
    }
  }

  async getExpectedYield(): Promise<YieldEstimate> {
    if (this._shouldFail) throw new Error(`${this.name}: yield fetch failed`)
    return { ...this._yield, timestamp: Date.now() }
  }

  async getRisk(): Promise<RiskMetrics> {
    if (this._shouldFail) throw new Error(`${this.name}: risk fetch failed`)
    return { ...this._risk }
  }

  async estimateSlippage(_amount: bigint): Promise<number> {
    if (this._shouldFail) throw new Error(`${this.name}: slippage estimate failed`)
    return this._slippageBps
  }

  async deposit(amount: bigint): Promise<string> {
    if (this._shouldFail) throw new Error(`${this.name}: deposit failed`)
    this._position.depositedAmount += amount
    this._position.currentValue += amount
    this._position.isActive = true
    this._position.entryTimestamp = Date.now()
    return `mock-tx-${this.name}-deposit`
  }

  async withdraw(amount: bigint): Promise<string> {
    if (this._shouldFail) throw new Error(`${this.name}: withdraw failed`)
    this._position.depositedAmount -= amount
    this._position.currentValue -= amount
    if (this._position.depositedAmount <= 0n) {
      this._position.isActive = false
    }
    return `mock-tx-${this.name}-withdraw`
  }

  async getPosition(): Promise<PositionState> {
    return { ...this._position }
  }

  setFailMode(shouldFail: boolean): void {
    this._shouldFail = shouldFail
  }

  setYield(apy: number): void {
    this._yield.annualizedApy = apy
  }

  setVolatility(score: number): void {
    this._risk.volatilityScore = score
  }
}
