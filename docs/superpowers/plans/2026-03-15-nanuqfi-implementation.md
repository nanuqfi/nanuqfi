# NanuqFi Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build NanuqFi — a protocol-agnostic, AI-powered yield routing layer for DeFi on Solana, targeting the Ranger Build-A-Bear hackathon (April 6, 2026).

**Architecture:** Multi-repo under `github.com/nanuqfi/` org. Core monorepo (`nanuqfi/nanuqfi`) publishes `@nanuqfi/core` (zero-dep interfaces) and `@nanuqfi/backend-drift` (Drift integration). Separate repos for the AI keeper (`nanuqfi-keeper`) and frontend (`nanuqfi-app`). On-chain allocator (Anchor/Rust) enforces risk guardrails; TypeScript keeper proposes rebalances.

**Tech Stack:** Anchor (Rust), TypeScript strict mode, pnpm + Turborepo, Vitest, Next.js (App Router), Tailwind, Drift SDK, Claude API.

**Spec:** `docs/superpowers/specs/2026-03-15-nanuqfi-vault-strategy-design.md`

**Quality Gate Rule:** Don't ship Phase N+1 until Phase N is bulletproof. Each phase ends with a quality gate checklist.

**Timeline:** 3 weeks (March 15 → April 6, 2026)

| Phase | What | Week |
|---|---|---|
| 1 | Repo setup + Core SDK (`@nanuqfi/core`) | Week 1 (Mar 15-18) |
| 2 | On-chain Allocator Program | Week 1-2 (Mar 18-22) |
| 3 | Backend Drift (`@nanuqfi/backend-drift`) | Week 2 (Mar 22-25) |
| 4 | AI Keeper (`nanuqfi-keeper`) | Week 2-3 (Mar 25-30) |
| 5 | Frontend (`nanuqfi-app`) + Submission | Week 3 (Mar 30-Apr 6) |

---

## Chunk 1: Repo Setup + Core SDK

### Task 1: Create GitHub Repos and Core Monorepo Scaffold

**Files:**
- Create: `package.json` (workspace root)
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `pnpm-workspace.yaml`
- Create: `.gitignore`
- Create: `.eslintrc.js`
- Create: `CLAUDE.md`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/src/index.ts`
- Create: `packages/backend-drift/package.json`
- Create: `packages/backend-drift/tsconfig.json`
- Create: `packages/backend-drift/vitest.config.ts`
- Create: `packages/backend-drift/src/index.ts`

- [ ] **Step 1: Create GitHub repos**

```bash
gh repo create nanuqfi/nanuqfi --public --description "Protocol-agnostic yield routing layer for DeFi" --clone
gh repo create nanuqfi/nanuqfi-keeper --public --description "AI keeper bot for NanuqFi vaults"
gh repo create nanuqfi/nanuqfi-app --public --description "NanuqFi frontend dashboard"
```

- [ ] **Step 2: Initialize pnpm workspace**

Create `pnpm-workspace.yaml`:
```yaml
packages:
  - 'packages/*'
```

Create root `package.json`:
```json
{
  "name": "nanuqfi",
  "private": true,
  "scripts": {
    "build": "turbo build",
    "test": "turbo test",
    "test:int": "turbo test:int",
    "lint": "turbo lint",
    "clean": "turbo clean"
  },
  "devDependencies": {
    "turbo": "^2",
    "typescript": "^5.7",
    "vitest": "^3",
    "eslint": "^9",
    "@typescript-eslint/eslint-plugin": "^8",
    "@typescript-eslint/parser": "^8"
  },
  "packageManager": "pnpm@10.6.5",
  "engines": {
    "node": ">=22"
  }
}
```

Create `turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "test:int": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "clean": {
      "cache": false
    }
  }
}
```

Create `tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

- [ ] **Step 3: Scaffold `packages/core/`**

Create `packages/core/package.json`:
```json
{
  "name": "@nanuqfi/core",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/",
    "clean": "rm -rf dist"
  },
  "devDependencies": {
    "typescript": "^5.7",
    "vitest": "^3"
  }
}
```

Create `packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

Create `packages/core/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 5_000,
    teardownTimeout: 3_000,
    include: ['src/**/*.test.ts'],
  },
})
```

Create `packages/core/src/index.ts`:
```typescript
export * from './types'
export * from './interfaces'
export * from './registry'
export * from './router'
export * from './strategy'
```

- [ ] **Step 4: Scaffold `packages/backend-drift/`**

Same structure as core but with:
```json
{
  "name": "@nanuqfi/backend-drift",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "dependencies": {
    "@nanuqfi/core": "workspace:*",
    "@drift-labs/sdk": "^2"
  }
}
```

- [ ] **Step 5: Install dependencies and verify workspace**

```bash
pnpm install
pnpm turbo build  # should succeed (empty modules)
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold monorepo with core and backend-drift packages"
git push -u origin main
```

---

### Task 2: Core Types and Risk Level Enum

**Files:**
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/types.test.ts`

- [ ] **Step 1: Write failing tests for types**

Create `packages/core/src/types.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { RiskLevel, RISK_LEVELS, isValidRiskLevel } from './types'

describe('RiskLevel', () => {
  it('defines three risk levels', () => {
    expect(RISK_LEVELS).toEqual(['conservative', 'moderate', 'aggressive'])
  })

  it('validates valid risk levels', () => {
    expect(isValidRiskLevel('conservative')).toBe(true)
    expect(isValidRiskLevel('moderate')).toBe(true)
    expect(isValidRiskLevel('aggressive')).toBe(true)
  })

  it('rejects invalid risk levels', () => {
    expect(isValidRiskLevel('unknown')).toBe(false)
    expect(isValidRiskLevel('')).toBe(false)
    expect(isValidRiskLevel(undefined as unknown as string)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && pnpm vitest run src/types.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement types**

Create `packages/core/src/types.ts`:
```typescript
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
  weights: Record<string, number>  // backend name → allocation percentage (0-100, must sum to 100)
  riskLevel: RiskLevel
  algoScores: Record<string, number>  // backend name → risk-adjusted score
  aiReasoning?: string         // AI reasoning summary (if AI layer was involved)
  aiConfidence?: number        // 0-1
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
  maxDrawdown: number          // as decimal (0.05 = 5%)
  maxLeverage: number
  maxSingleAssetConcentration: number  // as decimal
  minRebalanceIntervalMs: number       // minimum time between rebalances
  maxAllocationShiftPerRebalance: number  // max % change per rebalance
  redemptionPeriodMs: number   // withdrawal waiting period
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/core && pnpm vitest run src/types.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/types.test.ts
git commit -m "feat(core): add risk level types, yield/risk/position interfaces"
```

---

### Task 3: YieldBackend and BackendCapabilities Interfaces

**Files:**
- Create: `packages/core/src/interfaces.ts`
- Create: `packages/core/src/interfaces.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/src/interfaces.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import type { YieldBackend, BackendCapabilities } from './interfaces'
import type { YieldEstimate, RiskMetrics, PositionState } from './types'

// Test that a mock implementation satisfies the interface
class TestBackend implements YieldBackend {
  readonly name = 'test-backend'
  readonly capabilities: BackendCapabilities = {
    supportedAssets: ['USDC'],
    supportsLeverage: false,
    maxLeverage: 1,
    isDeltaNeutral: false,
    hasAutoExit: false,
    liquidationRisk: 'none',
    minDeposit: 1_000_000n,   // 1 USDC
    maxDeposit: 1_000_000_000_000n,  // 1M USDC
    withdrawalDelay: 0,
  }

  async getExpectedYield(): Promise<YieldEstimate> {
    return {
      annualizedApy: 0.10,
      source: this.name,
      asset: 'USDC',
      confidence: 0.9,
      timestamp: Date.now(),
    }
  }

  async getRisk(): Promise<RiskMetrics> {
    return {
      volatilityScore: 0.1,
      maxDrawdown: 0.02,
      liquidationRisk: 'none',
      correlationToMarket: 0.3,
    }
  }

  async estimateSlippage(_amount: bigint): Promise<number> {
    return 5 // 5 bps
  }

  async deposit(_amount: bigint): Promise<string> {
    return 'mock-tx-sig'
  }

  async withdraw(_amount: bigint): Promise<string> {
    return 'mock-tx-sig'
  }

  async getPosition(): Promise<PositionState> {
    return {
      backend: this.name,
      asset: 'USDC',
      depositedAmount: 0n,
      currentValue: 0n,
      unrealizedPnl: 0n,
      entryTimestamp: 0,
      isActive: false,
    }
  }
}

describe('YieldBackend interface', () => {
  it('can be implemented with correct shape', () => {
    const backend = new TestBackend()
    expect(backend.name).toBe('test-backend')
    expect(backend.capabilities.supportedAssets).toContain('USDC')
    expect(backend.capabilities.liquidationRisk).toBe('none')
  })

  it('returns yield estimate', async () => {
    const backend = new TestBackend()
    const estimate = await backend.getExpectedYield()
    expect(estimate.annualizedApy).toBeGreaterThan(0)
    expect(estimate.source).toBe('test-backend')
  })

  it('returns risk metrics', async () => {
    const backend = new TestBackend()
    const risk = await backend.getRisk()
    expect(risk.volatilityScore).toBeGreaterThanOrEqual(0)
    expect(risk.volatilityScore).toBeLessThanOrEqual(1)
  })

  it('returns slippage estimate in basis points', async () => {
    const backend = new TestBackend()
    const slippage = await backend.estimateSlippage(1_000_000n)
    expect(slippage).toBeGreaterThanOrEqual(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && pnpm vitest run src/interfaces.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement interfaces**

Create `packages/core/src/interfaces.ts`:
```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/core && pnpm vitest run src/interfaces.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/interfaces.ts packages/core/src/interfaces.test.ts
git commit -m "feat(core): add YieldBackend and BackendCapabilities interfaces"
```

---

### Task 4: YieldBackendRegistry

**Files:**
- Create: `packages/core/src/registry.ts`
- Create: `packages/core/src/registry.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/src/registry.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { YieldBackendRegistry } from './registry'
import { MockYieldBackend } from './mocks/mock-yield-backend'

describe('YieldBackendRegistry', () => {
  let registry: YieldBackendRegistry

  beforeEach(() => {
    registry = new YieldBackendRegistry()
  })

  it('registers and retrieves a backend by name', () => {
    const backend = new MockYieldBackend('lending', { supportedAssets: ['USDC'] })
    registry.register(backend)
    expect(registry.get('lending')).toBe(backend)
  })

  it('returns undefined for unknown backend', () => {
    expect(registry.get('nonexistent')).toBeUndefined()
  })

  it('lists all registered backends', () => {
    registry.register(new MockYieldBackend('lending'))
    registry.register(new MockYieldBackend('basis'))
    expect(registry.list()).toHaveLength(2)
    expect(registry.list().map(b => b.name)).toEqual(['lending', 'basis'])
  })

  it('throws on duplicate registration', () => {
    registry.register(new MockYieldBackend('lending'))
    expect(() => registry.register(new MockYieldBackend('lending')))
      .toThrow('Backend "lending" is already registered')
  })

  it('unregisters a backend', () => {
    registry.register(new MockYieldBackend('lending'))
    registry.unregister('lending')
    expect(registry.get('lending')).toBeUndefined()
    expect(registry.list()).toHaveLength(0)
  })

  it('filters by capability', () => {
    registry.register(new MockYieldBackend('lending', {
      supportedAssets: ['USDC'],
      isDeltaNeutral: false,
    }))
    registry.register(new MockYieldBackend('basis', {
      supportedAssets: ['USDC', 'SOL'],
      isDeltaNeutral: true,
    }))

    const deltaNeutral = registry.filterByCapability(c => c.isDeltaNeutral)
    expect(deltaNeutral).toHaveLength(1)
    expect(deltaNeutral[0].name).toBe('basis')

    const usdcBackends = registry.filterByCapability(c =>
      c.supportedAssets.includes('USDC')
    )
    expect(usdcBackends).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && pnpm vitest run src/registry.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement MockYieldBackend**

Create `packages/core/src/mocks/mock-yield-backend.ts`:
```typescript
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

  // Test helpers
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
```

Create `packages/core/src/mocks/index.ts`:
```typescript
export { MockYieldBackend } from './mock-yield-backend'
```

- [ ] **Step 4: Implement YieldBackendRegistry**

Create `packages/core/src/registry.ts`:
```typescript
import type { BackendCapabilities, YieldBackend } from './interfaces'

export class YieldBackendRegistry {
  private backends: Map<string, YieldBackend> = new Map()

  register(backend: YieldBackend): void {
    if (this.backends.has(backend.name)) {
      throw new Error(`Backend "${backend.name}" is already registered`)
    }
    this.backends.set(backend.name, backend)
  }

  unregister(name: string): void {
    this.backends.delete(name)
  }

  get(name: string): YieldBackend | undefined {
    return this.backends.get(name)
  }

  list(): YieldBackend[] {
    return [...this.backends.values()]
  }

  filterByCapability(
    predicate: (capabilities: BackendCapabilities) => boolean,
  ): YieldBackend[] {
    return this.list().filter(b => predicate(b.capabilities))
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd packages/core && pnpm vitest run src/registry.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/registry.ts packages/core/src/registry.test.ts packages/core/src/mocks/
git commit -m "feat(core): add YieldBackendRegistry with mock backend"
```

---

### Task 5: YieldRouter with Circuit Breaker

**Files:**
- Create: `packages/core/src/router.ts`
- Create: `packages/core/src/router.test.ts`
- Create: `packages/core/src/circuit-breaker.ts`
- Create: `packages/core/src/circuit-breaker.test.ts`

- [ ] **Step 1: Write failing tests for CircuitBreaker**

Create `packages/core/src/circuit-breaker.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CircuitBreaker, CircuitState } from './circuit-breaker'

describe('CircuitBreaker', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('starts in CLOSED state', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 10_000 })
    expect(cb.state).toBe(CircuitState.CLOSED)
  })

  it('opens after failure threshold', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 10_000 })
    const failing = () => Promise.reject(new Error('fail'))

    await expect(cb.execute(failing)).rejects.toThrow('fail')
    expect(cb.state).toBe(CircuitState.CLOSED)

    await expect(cb.execute(failing)).rejects.toThrow('fail')
    expect(cb.state).toBe(CircuitState.OPEN)
  })

  it('rejects immediately when OPEN', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 10_000 })
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow()

    await expect(cb.execute(() => Promise.resolve('ok'))).rejects.toThrow('Circuit is OPEN')
  })

  it('transitions to HALF_OPEN after reset timeout', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 5_000 })
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow()
    expect(cb.state).toBe(CircuitState.OPEN)

    vi.advanceTimersByTime(5_001)
    expect(cb.state).toBe(CircuitState.HALF_OPEN)
  })

  it('closes on success in HALF_OPEN state', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 5_000 })
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow()

    vi.advanceTimersByTime(5_001)
    const result = await cb.execute(() => Promise.resolve('recovered'))
    expect(result).toBe('recovered')
    expect(cb.state).toBe(CircuitState.CLOSED)
  })

  it('resets failure count on success', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 10_000 })
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow()
    await cb.execute(() => Promise.resolve('ok'))
    expect(cb.state).toBe(CircuitState.CLOSED)
    // failure count reset, need 3 more failures to open
  })
})
```

- [ ] **Step 2: Implement CircuitBreaker**

Create `packages/core/src/circuit-breaker.ts`:
```typescript
export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

interface CircuitBreakerConfig {
  failureThreshold: number
  resetTimeoutMs: number
}

export class CircuitBreaker {
  private _state = CircuitState.CLOSED
  private failureCount = 0
  private lastFailureTime = 0
  private readonly config: CircuitBreakerConfig

  constructor(config: CircuitBreakerConfig) {
    this.config = config
  }

  get state(): CircuitState {
    if (
      this._state === CircuitState.OPEN &&
      Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs
    ) {
      this._state = CircuitState.HALF_OPEN
    }
    return this._state
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      throw new Error('Circuit is OPEN')
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess(): void {
    this.failureCount = 0
    this._state = CircuitState.CLOSED
  }

  private onFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()
    if (this.failureCount >= this.config.failureThreshold) {
      this._state = CircuitState.OPEN
    }
  }
}
```

- [ ] **Step 3: Run circuit breaker tests**

```bash
cd packages/core && pnpm vitest run src/circuit-breaker.test.ts
```
Expected: PASS

- [ ] **Step 4: Write failing tests for YieldRouter**

Create `packages/core/src/router.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { YieldRouter } from './router'
import { YieldBackendRegistry } from './registry'
import { MockYieldBackend } from './mocks/mock-yield-backend'

describe('YieldRouter', () => {
  let registry: YieldBackendRegistry
  let router: YieldRouter

  beforeEach(() => {
    registry = new YieldBackendRegistry()
    router = new YieldRouter(registry)
  })

  it('ranks backends by risk-adjusted yield (highest first)', async () => {
    registry.register(new MockYieldBackend('low-yield', {}, { apy: 0.08, volatility: 0.1 }))
    registry.register(new MockYieldBackend('high-yield', {}, { apy: 0.25, volatility: 0.2 }))
    registry.register(new MockYieldBackend('mid-yield', {}, { apy: 0.15, volatility: 0.1 }))

    const ranked = await router.getBestYields({ asset: 'USDC' })
    expect(ranked[0].backend).toBe('mid-yield')  // 0.15/0.1 = 1.5 (best risk-adjusted)
    expect(ranked[1].backend).toBe('high-yield')  // 0.25/0.2 = 1.25
    expect(ranked[2].backend).toBe('low-yield')   // 0.08/0.1 = 0.8
  })

  it('filters by minimum yield', async () => {
    registry.register(new MockYieldBackend('low', {}, { apy: 0.05 }))
    registry.register(new MockYieldBackend('high', {}, { apy: 0.20 }))

    const ranked = await router.getBestYields({ asset: 'USDC', minYield: 0.10 })
    expect(ranked).toHaveLength(1)
    expect(ranked[0].backend).toBe('high')
  })

  it('skips failing backends gracefully', async () => {
    registry.register(new MockYieldBackend('healthy', {}, { apy: 0.15 }))
    registry.register(new MockYieldBackend('broken', {}, { shouldFail: true }))

    const ranked = await router.getBestYields({ asset: 'USDC' })
    expect(ranked).toHaveLength(1)
    expect(ranked[0].backend).toBe('healthy')
  })

  it('returns empty array when all backends fail', async () => {
    registry.register(new MockYieldBackend('broken1', {}, { shouldFail: true }))
    registry.register(new MockYieldBackend('broken2', {}, { shouldFail: true }))

    const ranked = await router.getBestYields({ asset: 'USDC' })
    expect(ranked).toHaveLength(0)
  })

  it('filters by asset support', async () => {
    registry.register(new MockYieldBackend('usdc-only', { supportedAssets: ['USDC'] }))
    registry.register(new MockYieldBackend('sol-only', { supportedAssets: ['SOL'] }))

    const ranked = await router.getBestYields({ asset: 'USDC' })
    expect(ranked).toHaveLength(1)
    expect(ranked[0].backend).toBe('usdc-only')
  })
})
```

- [ ] **Step 5: Implement YieldRouter**

Create `packages/core/src/router.ts`:
```typescript
import type { YieldBackendRegistry } from './registry'
import type { Asset } from './types'
import { CircuitBreaker } from './circuit-breaker'

interface YieldQuery {
  asset: Asset
  minYield?: number
}

export interface RankedYield {
  backend: string
  annualizedApy: number
  volatilityScore: number
  riskAdjustedScore: number
  confidence: number
}

export class YieldRouter {
  private readonly registry: YieldBackendRegistry
  private readonly breakers: Map<string, CircuitBreaker> = new Map()

  constructor(registry: YieldBackendRegistry) {
    this.registry = registry
  }

  async getBestYields(query: YieldQuery): Promise<RankedYield[]> {
    const backends = this.registry.filterByCapability(c =>
      c.supportedAssets.includes(query.asset)
    )

    const results = await Promise.allSettled(
      backends.map(async backend => {
        const breaker = this.getBreaker(backend.name)
        const [yieldEst, risk] = await breaker.execute(() =>
          Promise.all([backend.getExpectedYield(), backend.getRisk()])
        )

        const volatility = Math.max(risk.volatilityScore, 0.001) // avoid division by zero
        const riskAdjustedScore = yieldEst.annualizedApy / volatility

        return {
          backend: backend.name,
          annualizedApy: yieldEst.annualizedApy,
          volatilityScore: risk.volatilityScore,
          riskAdjustedScore,
          confidence: yieldEst.confidence,
        }
      })
    )

    return results
      .filter((r): r is PromiseFulfilledResult<RankedYield> => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(r => query.minYield === undefined || r.annualizedApy >= query.minYield)
      .sort((a, b) => b.riskAdjustedScore - a.riskAdjustedScore)
  }

  private getBreaker(name: string): CircuitBreaker {
    let breaker = this.breakers.get(name)
    if (!breaker) {
      breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 30_000 })
      this.breakers.set(name, breaker)
    }
    return breaker
  }
}
```

- [ ] **Step 6: Run router tests**

```bash
cd packages/core && pnpm vitest run src/router.test.ts
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/circuit-breaker.ts packages/core/src/circuit-breaker.test.ts \
  packages/core/src/router.ts packages/core/src/router.test.ts
git commit -m "feat(core): add YieldRouter with circuit breaker protection"
```

---

### Task 6: BaseVaultStrategy Abstract Class

**Files:**
- Create: `packages/core/src/strategy.ts`
- Create: `packages/core/src/strategy.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/src/strategy.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { BaseVaultStrategy } from './strategy'
import type { WeightProposal, RebalanceResult, GuardrailConfig, RiskLevel } from './types'
import type { YieldBackend } from './interfaces'
import { MockYieldBackend } from './mocks/mock-yield-backend'

class TestStrategy extends BaseVaultStrategy {
  readonly riskLevel: RiskLevel = 'moderate'
  readonly allowedSources: YieldBackend[] = [
    new MockYieldBackend('lending'),
    new MockYieldBackend('basis'),
  ]
  readonly guardrails: GuardrailConfig = {
    maxPerStrategyAllocation: { lending: 40, basis: 60 },
    maxDrawdown: 0.05,
    maxLeverage: 1,
    maxSingleAssetConcentration: 0.20,
    minRebalanceIntervalMs: 3_600_000,
    maxAllocationShiftPerRebalance: 20,
    redemptionPeriodMs: 172_800_000,
  }

  protected async executeRebalance(weights: WeightProposal): Promise<RebalanceResult> {
    return {
      status: 'executed',
      previousWeights: { lending: 50, basis: 50 },
      newWeights: weights.weights,
      guardrailViolations: [],
      txSignature: 'mock-tx',
      timestamp: Date.now(),
    }
  }
}

describe('BaseVaultStrategy', () => {
  it('validates weights sum to 100', async () => {
    const strategy = new TestStrategy()
    const proposal: WeightProposal = {
      weights: { lending: 30, basis: 60 }, // sum = 90, not 100
      riskLevel: 'moderate',
      algoScores: {},
      timestamp: Date.now(),
    }

    await expect(strategy.rebalance(proposal)).rejects.toThrow('Weights must sum to 100')
  })

  it('rejects negative weights', async () => {
    const strategy = new TestStrategy()
    const proposal: WeightProposal = {
      weights: { lending: -10, basis: 110 },
      riskLevel: 'moderate',
      algoScores: {},
      timestamp: Date.now(),
    }

    await expect(strategy.rebalance(proposal)).rejects.toThrow('Negative weight')
  })

  it('rejects weights exceeding per-strategy caps', async () => {
    const strategy = new TestStrategy()
    const proposal: WeightProposal = {
      weights: { lending: 10, basis: 90 }, // basis max is 60
      riskLevel: 'moderate',
      algoScores: {},
      timestamp: Date.now(),
    }

    await expect(strategy.rebalance(proposal)).rejects.toThrow('exceeds max allocation')
  })

  it('executes valid rebalance', async () => {
    const strategy = new TestStrategy()
    const proposal: WeightProposal = {
      weights: { lending: 40, basis: 60 },
      riskLevel: 'moderate',
      algoScores: {},
      timestamp: Date.now(),
    }

    const result = await strategy.rebalance(proposal)
    expect(result.status).toBe('executed')
    expect(result.newWeights).toEqual({ lending: 40, basis: 60 })
  })
})
```

- [ ] **Step 2: Implement BaseVaultStrategy**

Create `packages/core/src/strategy.ts`:
```typescript
import type { GuardrailConfig, RiskLevel, WeightProposal, RebalanceResult } from './types'
import type { YieldBackend } from './interfaces'

export abstract class BaseVaultStrategy {
  abstract readonly riskLevel: RiskLevel
  abstract readonly allowedSources: YieldBackend[]
  abstract readonly guardrails: GuardrailConfig

  async rebalance(proposal: WeightProposal): Promise<RebalanceResult> {
    this.validateWeights(proposal)
    this.validateGuardrails(proposal)
    return this.executeRebalance(proposal)
  }

  protected abstract executeRebalance(proposal: WeightProposal): Promise<RebalanceResult>

  private validateWeights(proposal: WeightProposal): void {
    const values = Object.values(proposal.weights)

    for (const [name, weight] of Object.entries(proposal.weights)) {
      if (weight < 0) {
        throw new Error(`Negative weight for "${name}": ${weight}`)
      }
    }

    const sum = values.reduce((a, b) => a + b, 0)
    if (Math.abs(sum - 100) > 0.01) {
      throw new Error(`Weights must sum to 100, got ${sum}`)
    }
  }

  private validateGuardrails(proposal: WeightProposal): void {
    const caps = this.guardrails.maxPerStrategyAllocation

    for (const [name, weight] of Object.entries(proposal.weights)) {
      const max = caps[name]
      if (max !== undefined && weight > max) {
        throw new Error(
          `"${name}" weight ${weight}% exceeds max allocation of ${max}%`
        )
      }
    }
  }
}
```

- [ ] **Step 3: Run tests**

```bash
cd packages/core && pnpm vitest run src/strategy.test.ts
```
Expected: PASS

- [ ] **Step 4: Run all core tests**

```bash
cd packages/core && pnpm vitest run
```
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/strategy.ts packages/core/src/strategy.test.ts
git commit -m "feat(core): add BaseVaultStrategy with weight and guardrail validation"
```

---

### Task 7: Update Core Exports and Build

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Update index.ts exports**

```typescript
// Types
export * from './types'

// Interfaces
export * from './interfaces'

// Registry
export { YieldBackendRegistry } from './registry'

// Router
export { YieldRouter } from './router'
export type { RankedYield } from './router'

// Strategy
export { BaseVaultStrategy } from './strategy'

// Circuit Breaker
export { CircuitBreaker, CircuitState } from './circuit-breaker'

// Mocks (for consumers' test suites)
export { MockYieldBackend } from './mocks/mock-yield-backend'
```

- [ ] **Step 2: Build and verify**

```bash
pnpm turbo build
pnpm turbo test
```
Expected: Build succeeds, all tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): finalize exports for @nanuqfi/core v0.1.0"
```

---

### Phase 1 Quality Gate

Before proceeding to Phase 2, verify:

- [ ] All core tests pass: `cd packages/core && pnpm vitest run`
- [ ] Build succeeds: `pnpm turbo build`
- [ ] Types compile with no errors: `cd packages/core && pnpm tsc --noEmit`
- [ ] Lint passes: `pnpm turbo lint`
- [ ] All interfaces have mock implementations
- [ ] CircuitBreaker tested (CLOSED → OPEN → HALF_OPEN → CLOSED cycle)
- [ ] Registry tested (register, unregister, filter)
- [ ] Router tested (ranking, filtering, graceful failure handling)
- [ ] Strategy tested (weight validation, guardrail enforcement)

**If any check fails → fix before proceeding to Phase 2.**

---

## Chunk 2: On-Chain Allocator Program

### Task 8: Anchor Program Scaffold

**Files:**
- Create: `programs/allocator/Cargo.toml`
- Create: `programs/allocator/src/lib.rs`
- Create: `programs/allocator/src/state.rs`
- Create: `programs/allocator/src/errors.rs`
- Create: `Anchor.toml`

- [ ] **Step 1: Initialize Anchor project**

From the monorepo root:
```bash
anchor init programs/allocator --name nanuqfi_allocator
```

If `anchor init` doesn't support nested paths, manually scaffold:
```bash
mkdir -p programs/allocator/src
```

- [ ] **Step 2: Create Anchor.toml at repo root**

```toml
[toolchain]
anchor_version = "0.30.1"

[features]
resolution = true
skip-lint = false

[programs.localnet]
nanuqfi_allocator = "11111111111111111111111111111111"

[programs.devnet]
nanuqfi_allocator = "11111111111111111111111111111111"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "localnet"
wallet = "~/.config/solana/id.json"

[scripts]
test = "pnpm vitest run"
```

Note: Replace program ID with actual deployed ID after first `anchor build`.

- [ ] **Step 3: Create error definitions**

Create `programs/allocator/src/errors.rs`:
```rust
use anchor_lang::prelude::*;

#[error_code]
pub enum AllocatorError {
    #[msg("Weights must sum to 10000 (basis points)")]
    InvalidWeightSum,
    #[msg("Weight exceeds maximum allocation for this strategy")]
    WeightExceedsMax,
    #[msg("Negative weight value")]
    NegativeWeight,
    #[msg("Rebalance interval not met")]
    RebalanceTooSoon,
    #[msg("Allocation shift exceeds maximum per rebalance")]
    ShiftTooLarge,
    #[msg("Unauthorized: not the keeper authority")]
    UnauthorizedKeeper,
    #[msg("Unauthorized: not the admin")]
    UnauthorizedAdmin,
    #[msg("Allocator is halted")]
    AllocatorHalted,
    #[msg("Drawdown exceeds maximum for this vault tier")]
    DrawdownExceeded,
    #[msg("Oracle divergence exceeds threshold")]
    OracleDivergence,
    #[msg("Redemption period not elapsed")]
    RedemptionPeriodNotElapsed,
    #[msg("No pending withdrawal")]
    NoPendingWithdrawal,
    #[msg("Invalid risk level")]
    InvalidRiskLevel,
    #[msg("Vault already initialized")]
    VaultAlreadyInitialized,
    #[msg("Cannot loosen guardrails beyond initial values")]
    CannotLoosenGuardrails,
    #[msg("Keeper lease is active for another instance")]
    LeaseConflict,
    #[msg("Insufficient vault balance for withdrawal")]
    InsufficientBalance,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
```

- [ ] **Step 4: Create account state definitions**

Create `programs/allocator/src/state.rs`:
```rust
use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Allocator {
    pub admin: Pubkey,
    pub keeper_authority: Pubkey,
    pub total_tvl: u64,
    pub halted: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum RiskLevel {
    Conservative, // 0
    Moderate,     // 1
    Aggressive,   // 2
}

impl RiskLevel {
    pub fn as_u8(&self) -> u8 {
        match self {
            RiskLevel::Conservative => 0,
            RiskLevel::Moderate => 1,
            RiskLevel::Aggressive => 2,
        }
    }
}

#[account]
#[derive(InitSpace)]
pub struct RiskVault {
    pub allocator: Pubkey,
    pub risk_level: RiskLevel,
    pub drift_vault: Pubkey,
    pub share_mint: Pubkey,
    pub total_shares: u64,
    pub total_assets: u64,         // USDC base units (6 decimals)
    pub peak_equity: u64,
    pub current_equity: u64,
    pub equity_24h_ago: u64,
    pub last_rebalance_slot: u64,
    pub rebalance_counter: u32,
    pub last_mgmt_fee_slot: u64,       // slot of last management fee accrual
    #[max_len(MAX_WEIGHTS)]
    pub current_weights: Vec<u16>,     // current allocation weights (bps) for previous_weights tracking
    // Guardrail params (in basis points, 10000 = 100%)
    pub max_perp_allocation_bps: u16,
    pub max_lending_allocation_bps: u16,
    pub max_single_asset_bps: u16,
    pub max_drawdown_bps: u16,
    pub max_leverage_bps: u16,     // 10000 = 1x, 30000 = 3x
    pub redemption_period_slots: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UserPosition {
    pub user: Pubkey,
    pub risk_vault: Pubkey,
    pub shares: u64,
    pub deposited_usdc: u64,
    pub entry_slot: u64,
    pub high_water_mark_price: u64,      // share price at last peak (for perf fee)
    pub pending_withdrawal_shares: u64,
    pub withdraw_request_slot: u64,
    pub request_time_share_price: u64,   // share price at withdrawal request (for worse-of)
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Treasury {
    pub allocator: Pubkey,
    pub usdc_token_account: Pubkey,
    pub total_fees_collected: u64,
    pub bump: u8,
}

const MAX_WEIGHTS: usize = 8; // max yield sources per vault
const MAX_REASON_HASH: usize = 32; // SHA-256 of AI reasoning

#[account]
#[derive(InitSpace)]
pub struct RebalanceRecord {
    pub risk_vault: Pubkey,
    pub counter: u32,
    pub slot: u64,
    #[max_len(MAX_WEIGHTS)]
    pub previous_weights: Vec<u16>,  // basis points per source
    #[max_len(MAX_WEIGHTS)]
    pub new_weights: Vec<u16>,
    #[max_len(MAX_REASON_HASH)]
    pub ai_reasoning_hash: Vec<u8>,  // SHA-256 of reasoning text
    pub approved: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct KeeperLease {
    pub keeper: Pubkey,
    pub lease_expiry_slot: u64,
    pub heartbeat_slot: u64,
    pub bump: u8,
}
```

- [ ] **Step 5: Create program entrypoint with initialize_allocator**

Create `programs/allocator/src/lib.rs`:
```rust
use anchor_lang::prelude::*;

mod errors;
mod state;

use errors::AllocatorError;
use state::*;

declare_id!("11111111111111111111111111111111"); // replaced after first build

#[program]
pub mod nanuqfi_allocator {
    use super::*;

    pub fn initialize_allocator(ctx: Context<InitializeAllocator>) -> Result<()> {
        let allocator = &mut ctx.accounts.allocator;
        allocator.admin = ctx.accounts.admin.key();
        allocator.keeper_authority = ctx.accounts.keeper_authority.key();
        allocator.total_tvl = 0;
        allocator.halted = false;
        allocator.bump = ctx.bumps.allocator;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeAllocator<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + Allocator::INIT_SPACE,
        seeds = [b"allocator"],
        bump
    )]
    pub allocator: Account<'info, Allocator>,
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: keeper authority pubkey, stored but not validated
    pub keeper_authority: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}
```

- [ ] **Step 6: Build and verify**

```bash
anchor build
```
Expected: Build succeeds. Update `declare_id!` with actual program ID from `target/deploy/nanuqfi_allocator-keypair.json`.

- [ ] **Step 7: Commit**

```bash
git add programs/ Anchor.toml
git commit -m "feat(allocator): scaffold Anchor program with state, errors, and initialize instruction"
```

---

### Task 9: Initialize Risk Vault Instruction

**Files:**
- Modify: `programs/allocator/src/lib.rs`

- [ ] **Step 1: Add initialize_risk_vault instruction**

Add to `lib.rs` inside `pub mod nanuqfi_allocator`:
```rust
pub fn initialize_risk_vault(
    ctx: Context<InitializeRiskVault>,
    risk_level: RiskLevel,
    max_perp_bps: u16,
    max_lending_bps: u16,
    max_single_asset_bps: u16,
    max_drawdown_bps: u16,
    max_leverage_bps: u16,
    redemption_period_slots: u64,
) -> Result<()> {
    let vault = &mut ctx.accounts.risk_vault;
    vault.allocator = ctx.accounts.allocator.key();
    vault.risk_level = risk_level;
    vault.drift_vault = ctx.accounts.drift_vault.key();
    vault.share_mint = ctx.accounts.share_mint.key();
    vault.total_shares = 0;
    vault.total_assets = 0;
    vault.peak_equity = 0;
    vault.current_equity = 0;
    vault.equity_24h_ago = 0;
    vault.last_rebalance_slot = 0;
    vault.rebalance_counter = 0;
    vault.max_perp_allocation_bps = max_perp_bps;
    vault.max_lending_allocation_bps = max_lending_bps;
    vault.max_single_asset_bps = max_single_asset_bps;
    vault.max_drawdown_bps = max_drawdown_bps;
    vault.max_leverage_bps = max_leverage_bps;
    vault.redemption_period_slots = redemption_period_slots;
    vault.bump = ctx.bumps.risk_vault;
    Ok(())
}
```

Add accounts struct:
```rust
#[derive(Accounts)]
#[instruction(risk_level: RiskLevel)]
pub struct InitializeRiskVault<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + RiskVault::INIT_SPACE,
        seeds = [b"vault", &[risk_level.as_u8()]],
        bump
    )]
    pub risk_vault: Account<'info, RiskVault>,
    #[account(
        seeds = [b"allocator"],
        bump = allocator.bump,
        has_one = admin @ AllocatorError::UnauthorizedAdmin,
    )]
    pub allocator: Account<'info, Allocator>,
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: Drift vault address, stored for reference
    pub drift_vault: UncheckedAccount<'info>,
    /// CHECK: Share mint PDA, initialized separately
    pub share_mint: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}
```

- [ ] **Step 2: Build**

```bash
anchor build
```
Expected: PASS

- [ ] **Step 3: Write Anchor test for initialize_allocator + initialize_risk_vault**

Create `tests/allocator.ts`:
```typescript
import * as anchor from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
import { NanuqfiAllocator } from '../target/types/nanuqfi_allocator'
import { expect } from 'chai'

describe('nanuqfi-allocator', () => {
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)
  const program = anchor.workspace.NanuqfiAllocator as Program<NanuqfiAllocator>

  const admin = provider.wallet
  const keeperAuthority = anchor.web3.Keypair.generate()

  it('initializes allocator', async () => {
    const [allocatorPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('allocator')],
      program.programId
    )

    await program.methods
      .initializeAllocator()
      .accounts({
        allocator: allocatorPda,
        admin: admin.publicKey,
        keeperAuthority: keeperAuthority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc()

    const allocator = await program.account.allocator.fetch(allocatorPda)
    expect(allocator.admin.toBase58()).to.equal(admin.publicKey.toBase58())
    expect(allocator.keeperAuthority.toBase58()).to.equal(keeperAuthority.publicKey.toBase58())
    expect(allocator.halted).to.be.false
    expect(allocator.totalTvl.toNumber()).to.equal(0)
  })

  it('initializes conservative risk vault', async () => {
    const [allocatorPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('allocator')],
      program.programId
    )
    const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), Buffer.from([0])], // 0 = Conservative
      program.programId
    )
    const driftVault = anchor.web3.Keypair.generate()
    const shareMint = anchor.web3.Keypair.generate()

    await program.methods
      .initializeRiskVault(
        { conservative: {} },  // RiskLevel enum
        10000, // max_perp_bps: 100% lending/insurance
        10000, // max_lending_bps: 100%
        10000, // max_single_asset_bps: no restriction for conservative
        200,   // max_drawdown_bps: 2%
        10000, // max_leverage_bps: 1x
        new anchor.BN(43200), // redemption_period_slots: ~1 day at 400ms/slot
      )
      .accounts({
        riskVault: vaultPda,
        allocator: allocatorPda,
        admin: admin.publicKey,
        driftVault: driftVault.publicKey,
        shareMint: shareMint.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc()

    const vault = await program.account.riskVault.fetch(vaultPda)
    expect(vault.maxDrawdownBps).to.equal(200) // 2%
    expect(vault.totalShares.toNumber()).to.equal(0)
  })
})
```

- [ ] **Step 4: Run Anchor tests**

```bash
anchor test
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add programs/ tests/
git commit -m "feat(allocator): add initialize_risk_vault instruction with guardrail params"
```

---

### Task 9b: Initialize Share Mint and Treasury PDAs

**Files:**
- Modify: `programs/allocator/src/lib.rs`

These must exist before deposit/withdraw can work.

- [ ] **Step 1: Add share mint initialization to initialize_risk_vault**

The share mint PDA `["share_mint", risk_level]` is created as part of vault initialization. Add to `initialize_risk_vault`:

```rust
// Inside initialize_risk_vault, after vault setup:
// Initialize share mint PDA with allocator as mint authority
anchor_spl::token::initialize_mint2(
    CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        anchor_spl::token::InitializeMint2 {
            mint: ctx.accounts.share_mint.to_account_info(),
        },
    ),
    6, // USDC decimals
    &ctx.accounts.allocator.key(), // mint authority = allocator PDA
    None, // no freeze authority
)?;
```

Update `InitializeRiskVault` accounts to properly init the share mint:
```rust
#[account(
    init,
    payer = admin,
    mint::decimals = 6,
    mint::authority = allocator,
    seeds = [b"share_mint", &[risk_level.as_u8()]],
    bump
)]
pub share_mint: Account<'info, anchor_spl::token::Mint>,
pub token_program: Program<'info, anchor_spl::token::Token>,
```

- [ ] **Step 2: Add initialize_treasury instruction**

```rust
pub fn initialize_treasury(ctx: Context<InitializeTreasury>) -> Result<()> {
    let treasury = &mut ctx.accounts.treasury;
    treasury.allocator = ctx.accounts.allocator.key();
    treasury.usdc_token_account = ctx.accounts.treasury_usdc.key();
    treasury.total_fees_collected = 0;
    treasury.bump = ctx.bumps.treasury;
    Ok(())
}

pub fn withdraw_treasury(ctx: Context<WithdrawTreasury>, amount: u64) -> Result<()> {
    require!(
        ctx.accounts.admin.key() == ctx.accounts.allocator.admin,
        AllocatorError::UnauthorizedAdmin
    );
    let allocator_seeds = &[b"allocator".as_ref(), &[ctx.accounts.allocator.bump]];
    anchor_spl::token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: ctx.accounts.treasury_usdc.to_account_info(),
                to: ctx.accounts.admin_usdc.to_account_info(),
                authority: ctx.accounts.allocator.to_account_info(),
            },
            &[allocator_seeds],
        ),
        amount,
    )?;
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeTreasury<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + Treasury::INIT_SPACE,
        seeds = [b"treasury"],
        bump
    )]
    pub treasury: Account<'info, Treasury>,
    #[account(
        seeds = [b"allocator"],
        bump = allocator.bump,
        has_one = admin @ AllocatorError::UnauthorizedAdmin,
    )]
    pub allocator: Account<'info, Allocator>,
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: USDC token account for treasury
    pub treasury_usdc: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawTreasury<'info> {
    #[account(
        seeds = [b"allocator"],
        bump = allocator.bump,
        has_one = admin @ AllocatorError::UnauthorizedAdmin,
    )]
    pub allocator: Account<'info, Allocator>,
    #[account(
        seeds = [b"treasury"],
        bump = treasury.bump,
    )]
    pub treasury: Account<'info, Treasury>,
    #[account(
        mut,
        constraint = treasury_usdc.key() == treasury.usdc_token_account
    )]
    pub treasury_usdc: Account<'info, anchor_spl::token::TokenAccount>,
    #[account(mut)]
    pub admin_usdc: Account<'info, anchor_spl::token::TokenAccount>,
    pub admin: Signer<'info>,
    pub token_program: Program<'info, anchor_spl::token::Token>,
}
```

- [ ] **Step 3: Write Anchor tests for share mint + treasury**

```typescript
it('creates share mint PDA during vault init', async () => {
  const [shareMintPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('share_mint'), Buffer.from([0])], // conservative
    program.programId
  )
  // Verify mint exists and has correct authority after initialize_risk_vault
  const mintInfo = await getMint(connection, shareMintPda)
  expect(mintInfo.mintAuthority.toBase58()).to.equal(allocatorPda.toBase58())
  expect(mintInfo.decimals).to.equal(6)
})

it('initializes treasury', async () => {
  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    program.programId
  )
  await program.methods.initializeTreasury().accounts({...}).rpc()
  const treasury = await program.account.treasury.fetch(treasuryPda)
  expect(treasury.totalFeesCollected.toNumber()).to.equal(0)
})
```

- [ ] **Step 4: Build and test**

```bash
anchor build && anchor test
```

- [ ] **Step 5: Commit**

```bash
git add programs/ tests/
git commit -m "feat(allocator): add share mint PDA init and treasury with withdraw"
```

---

### Task 10: Deposit Instruction with Share Minting

**Files:**
- Modify: `programs/allocator/src/lib.rs`

- [ ] **Step 1: Add deposit instruction**

```rust
pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(!ctx.accounts.allocator.halted, AllocatorError::AllocatorHalted);
    require!(amount > 0, AllocatorError::InsufficientBalance);

    let vault = &mut ctx.accounts.risk_vault;

    // Calculate shares: if first deposit, 1:1. Otherwise pro-rata.
    let shares = if vault.total_shares == 0 || vault.total_assets == 0 {
        amount
    } else {
        (amount as u128)
            .checked_mul(vault.total_shares as u128)
            .ok_or(AllocatorError::MathOverflow)?
            .checked_div(vault.total_assets as u128)
            .ok_or(AllocatorError::MathOverflow)? as u64
    };

    // Transfer USDC from user to vault token account
    anchor_spl::token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: ctx.accounts.user_usdc.to_account_info(),
                to: ctx.accounts.vault_usdc.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
    )?;

    // Mint share tokens to user
    let allocator_seeds = &[b"allocator".as_ref(), &[ctx.accounts.allocator.bump]];
    anchor_spl::token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::MintTo {
                mint: ctx.accounts.share_mint.to_account_info(),
                to: ctx.accounts.user_shares.to_account_info(),
                authority: ctx.accounts.allocator.to_account_info(),
            },
            &[allocator_seeds],
        ),
        shares,
    )?;

    // Update state
    vault.total_shares = vault.total_shares
        .checked_add(shares)
        .ok_or(AllocatorError::MathOverflow)?;
    vault.total_assets = vault.total_assets
        .checked_add(amount)
        .ok_or(AllocatorError::MathOverflow)?;

    let position = &mut ctx.accounts.user_position;
    position.user = ctx.accounts.user.key();
    position.risk_vault = vault.key();
    position.shares = position.shares
        .checked_add(shares)
        .ok_or(AllocatorError::MathOverflow)?;
    position.deposited_usdc = position.deposited_usdc
        .checked_add(amount)
        .ok_or(AllocatorError::MathOverflow)?;
    position.entry_slot = Clock::get()?.slot;

    // Set initial high water mark (current share price)
    if position.high_water_mark_price == 0 {
        position.high_water_mark_price = if vault.total_shares > 0 {
            (vault.total_assets as u128)
                .checked_mul(1_000_000) // 6 decimal precision
                .ok_or(AllocatorError::MathOverflow)?
                .checked_div(vault.total_shares as u128)
                .ok_or(AllocatorError::MathOverflow)? as u64
        } else {
            1_000_000 // 1:1 initial price
        };
    }

    // Update allocator TVL
    let allocator = &mut ctx.accounts.allocator;
    allocator.total_tvl = allocator.total_tvl
        .checked_add(amount)
        .ok_or(AllocatorError::MathOverflow)?;

    Ok(())
}
```

- [ ] **Step 2: Add Deposit accounts struct**

```rust
#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [b"allocator"],
        bump = allocator.bump,
    )]
    pub allocator: Account<'info, Allocator>,
    #[account(
        mut,
        seeds = [b"vault", &[risk_vault.risk_level.as_u8()]],
        bump = risk_vault.bump,
    )]
    pub risk_vault: Account<'info, RiskVault>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserPosition::INIT_SPACE,
        seeds = [b"position", user.key().as_ref(), &[risk_vault.risk_level.as_u8()]],
        bump
    )]
    pub user_position: Account<'info, UserPosition>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub user_usdc: Account<'info, anchor_spl::token::TokenAccount>,
    #[account(mut)]
    pub vault_usdc: Account<'info, anchor_spl::token::TokenAccount>,
    #[account(mut)]
    pub share_mint: Account<'info, anchor_spl::token::Mint>,
    #[account(mut)]
    pub user_shares: Account<'info, anchor_spl::token::TokenAccount>,
    pub token_program: Program<'info, anchor_spl::token::Token>,
    pub system_program: Program<'info, System>,
}
```

- [ ] **Step 3: Add anchor-spl dependency to Cargo.toml**

```toml
[dependencies]
anchor-lang = "0.30.1"
anchor-spl = "0.30.1"
```

- [ ] **Step 4: Build and test**

```bash
anchor build
anchor test
```

- [ ] **Step 5: Commit**

```bash
git add programs/ tests/
git commit -m "feat(allocator): add deposit instruction with ERC-4626 share minting"
```

---

### Task 11: Request Withdraw and Withdraw Instructions

**Files:**
- Modify: `programs/allocator/src/lib.rs`

- [ ] **Step 1: Add request_withdraw instruction**

```rust
pub fn request_withdraw(ctx: Context<RequestWithdraw>, shares: u64) -> Result<()> {
    let position = &mut ctx.accounts.user_position;
    let vault = &ctx.accounts.risk_vault;

    require!(shares > 0, AllocatorError::InsufficientBalance);
    require!(
        position.shares >= shares,
        AllocatorError::InsufficientBalance
    );
    require!(
        position.pending_withdrawal_shares == 0,
        AllocatorError::NoPendingWithdrawal // already has pending
    );

    // Record request-time share price for worse-of comparison at withdrawal
    let current_share_price = if vault.total_shares > 0 {
        (vault.total_assets as u128)
            .checked_mul(1_000_000)
            .ok_or(AllocatorError::MathOverflow)?
            .checked_div(vault.total_shares as u128)
            .ok_or(AllocatorError::MathOverflow)? as u64
    } else {
        1_000_000
    };

    position.pending_withdrawal_shares = shares;
    position.withdraw_request_slot = Clock::get()?.slot;
    position.request_time_share_price = current_share_price;

    Ok(())
}

#[derive(Accounts)]
pub struct RequestWithdraw<'info> {
    #[account(
        seeds = [b"vault", &[risk_vault.risk_level.as_u8()]],
        bump = risk_vault.bump,
    )]
    pub risk_vault: Account<'info, RiskVault>,
    #[account(
        mut,
        seeds = [b"position", user.key().as_ref(), &[risk_vault.risk_level.as_u8()]],
        bump = user_position.bump,
        has_one = user,
    )]
    pub user_position: Account<'info, UserPosition>,
    pub user: Signer<'info>,
}
```

- [ ] **Step 2: Add withdraw instruction (two-phase completion)**

```rust
pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
    let position = &mut ctx.accounts.user_position;
    let vault = &mut ctx.accounts.risk_vault;

    require!(
        position.pending_withdrawal_shares > 0,
        AllocatorError::NoPendingWithdrawal
    );

    let current_slot = Clock::get()?.slot;
    let is_halted = ctx.accounts.allocator.halted;

    // Check redemption period (waived during emergency halt)
    if !is_halted {
        require!(
            current_slot >= position.withdraw_request_slot + vault.redemption_period_slots,
            AllocatorError::RedemptionPeriodNotElapsed
        );
    }

    let shares = position.pending_withdrawal_shares;

    // Calculate USDC amount using WORSE-OF request-time vs current price
    let current_price = if vault.total_shares > 0 {
        (vault.total_assets as u128)
            .checked_mul(1_000_000)
            .ok_or(AllocatorError::MathOverflow)?
            .checked_div(vault.total_shares as u128)
            .ok_or(AllocatorError::MathOverflow)? as u64
    } else {
        1_000_000
    };

    // Worse-of: protects remaining depositors from front-running
    let effective_price = current_price.min(position.request_time_share_price);

    let usdc_amount = (shares as u128)
        .checked_mul(effective_price as u128)
        .ok_or(AllocatorError::MathOverflow)?
        .checked_div(1_000_000)
        .ok_or(AllocatorError::MathOverflow)? as u64;

    // Calculate and deduct performance fee (based on effective price vs HWM)
    let performance_fee = if effective_price > position.high_water_mark_price {
        let gain_per_share = effective_price - position.high_water_mark_price;
        let total_gain = (shares as u128)
            .checked_mul(gain_per_share as u128)
            .ok_or(AllocatorError::MathOverflow)?
            .checked_div(1_000_000)
            .ok_or(AllocatorError::MathOverflow)? as u64;
        total_gain / 10 // 10% performance fee
    } else {
        0
    };

    let net_amount = usdc_amount
        .checked_sub(performance_fee)
        .ok_or(AllocatorError::MathOverflow)?;

    // Burn shares
    let allocator_seeds = &[b"allocator".as_ref(), &[ctx.accounts.allocator.bump]];
    anchor_spl::token::burn(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Burn {
                mint: ctx.accounts.share_mint.to_account_info(),
                from: ctx.accounts.user_shares.to_account_info(),
                authority: ctx.accounts.allocator.to_account_info(),
            },
            &[allocator_seeds],
        ),
        shares,
    )?;

    // Transfer USDC to user
    anchor_spl::token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: ctx.accounts.vault_usdc.to_account_info(),
                to: ctx.accounts.user_usdc.to_account_info(),
                authority: ctx.accounts.allocator.to_account_info(),
            },
            &[allocator_seeds],
        ),
        net_amount,
    )?;

    // Transfer performance fee to treasury (if any)
    if performance_fee > 0 {
        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.vault_usdc.to_account_info(),
                    to: ctx.accounts.treasury_usdc.to_account_info(),
                    authority: ctx.accounts.allocator.to_account_info(),
                },
                &[allocator_seeds],
            ),
            performance_fee,
        )?;
    }

    // Update state
    vault.total_shares = vault.total_shares.checked_sub(shares).ok_or(AllocatorError::MathOverflow)?;
    vault.total_assets = vault.total_assets.checked_sub(usdc_amount).ok_or(AllocatorError::MathOverflow)?;
    position.shares = position.shares.checked_sub(shares).ok_or(AllocatorError::MathOverflow)?;
    position.pending_withdrawal_shares = 0;
    position.withdraw_request_slot = 0;

    // Update HWM
    position.high_water_mark_price = effective_price;
    position.request_time_share_price = 0;

    // Update allocator TVL
    let allocator = &mut ctx.accounts.allocator;
    allocator.total_tvl = allocator.total_tvl.checked_sub(usdc_amount).ok_or(AllocatorError::MathOverflow)?;

    Ok(())
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [b"allocator"],
        bump = allocator.bump,
    )]
    pub allocator: Account<'info, Allocator>,
    #[account(
        mut,
        seeds = [b"vault", &[risk_vault.risk_level.as_u8()]],
        bump = risk_vault.bump,
    )]
    pub risk_vault: Account<'info, RiskVault>,
    #[account(
        mut,
        seeds = [b"position", user.key().as_ref(), &[risk_vault.risk_level.as_u8()]],
        bump = user_position.bump,
        has_one = user,
    )]
    pub user_position: Account<'info, UserPosition>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub user_usdc: Account<'info, anchor_spl::token::TokenAccount>,
    #[account(mut)]
    pub vault_usdc: Account<'info, anchor_spl::token::TokenAccount>,
    #[account(mut)]
    pub share_mint: Account<'info, anchor_spl::token::Mint>,
    #[account(mut)]
    pub user_shares: Account<'info, anchor_spl::token::TokenAccount>,
    #[account(mut)]
    pub treasury_usdc: Account<'info, anchor_spl::token::TokenAccount>,
    pub token_program: Program<'info, anchor_spl::token::Token>,
}
```

- [ ] **Step 2: Build and test**

```bash
anchor build
anchor test
```

- [ ] **Step 3: Commit**

```bash
git add programs/ tests/
git commit -m "feat(allocator): add two-phase withdrawal with performance fee and HWM"
```

---

### Task 12: Rebalance and Emergency Halt Instructions

**Files:**
- Modify: `programs/allocator/src/lib.rs`

- [ ] **Step 1: Add rebalance instruction with guardrail validation**

```rust
pub fn rebalance(
    ctx: Context<Rebalance>,
    new_weights: Vec<u16>,      // basis points per source
    equity_snapshot: u64,        // keeper-submitted vault equity
    ai_reasoning_hash: Vec<u8>,  // SHA-256 of AI reasoning (or empty)
) -> Result<()> {
    let allocator = &ctx.accounts.allocator;
    let vault = &mut ctx.accounts.risk_vault;

    require!(!allocator.halted, AllocatorError::AllocatorHalted);
    require!(
        ctx.accounts.keeper.key() == allocator.keeper_authority,
        AllocatorError::UnauthorizedKeeper
    );

    // Validate rebalance interval
    let current_slot = Clock::get()?.slot;
    let min_interval = 9000; // ~1 hour at 400ms/slot
    require!(
        current_slot >= vault.last_rebalance_slot + min_interval,
        AllocatorError::RebalanceTooSoon
    );

    // Validate weights sum to 10000 bps
    let weight_sum: u32 = new_weights.iter().map(|w| *w as u32).sum();
    require!(weight_sum == 10000, AllocatorError::InvalidWeightSum);

    // Validate per-strategy caps: check perp allocation against max_perp_allocation_bps
    // Weights are ordered: [lending, insurance, basis, funding, jito_dn, ...]
    // Perp-related weights are indices 2+ (basis, funding, jito_dn)
    let perp_total: u32 = new_weights.iter().skip(2).map(|w| *w as u32).sum();
    require!(
        perp_total <= vault.max_perp_allocation_bps as u32,
        AllocatorError::WeightExceedsMax
    );

    // Validate max allocation shift (20% = 2000 bps per rebalance)
    if !vault.current_weights.is_empty() && vault.current_weights.len() == new_weights.len() {
        for (i, new_w) in new_weights.iter().enumerate() {
            let old_w = vault.current_weights[i];
            let diff = (*new_w as i32 - old_w as i32).unsigned_abs() as u16;
            require!(diff <= 2000, AllocatorError::ShiftTooLarge); // 20% max shift
        }
    }

    // Oracle verification: keeper-submitted equity vs oracle-derived estimate
    // The oracle price is passed via remaining_accounts by the keeper
    // For Phase 1, we verify the equity_snapshot is within 1% of on-chain vault assets
    // Full Pyth oracle CPI verification is added during Drift integration phase
    let on_chain_assets = vault.total_assets;
    if on_chain_assets > 0 {
        let divergence_bps = if equity_snapshot > on_chain_assets {
            ((equity_snapshot - on_chain_assets) as u128)
                .checked_mul(10000)
                .ok_or(AllocatorError::MathOverflow)?
                .checked_div(on_chain_assets as u128)
                .ok_or(AllocatorError::MathOverflow)? as u16
        } else {
            ((on_chain_assets - equity_snapshot) as u128)
                .checked_mul(10000)
                .ok_or(AllocatorError::MathOverflow)?
                .checked_div(on_chain_assets as u128)
                .ok_or(AllocatorError::MathOverflow)? as u16
        };
        require!(divergence_bps <= 100, AllocatorError::OracleDivergence); // 1% max
    }

    // Update drawdown tracking
    vault.current_equity = equity_snapshot;
    if equity_snapshot > vault.peak_equity {
        vault.peak_equity = equity_snapshot;
    }

    // Check per-vault drawdown
    if vault.peak_equity > 0 {
        let drawdown_bps = ((vault.peak_equity - vault.current_equity) as u128)
            .checked_mul(10000)
            .ok_or(AllocatorError::MathOverflow)?
            .checked_div(vault.peak_equity as u128)
            .ok_or(AllocatorError::MathOverflow)? as u16;

        require!(
            drawdown_bps <= vault.max_drawdown_bps,
            AllocatorError::DrawdownExceeded
        );
    }

    // Check TVL emergency halt: >15% drop in 24h
    if vault.equity_24h_ago > 0 {
        let tvl_ratio_bps = (equity_snapshot as u128)
            .checked_mul(10000)
            .ok_or(AllocatorError::MathOverflow)?
            .checked_div(vault.equity_24h_ago as u128)
            .ok_or(AllocatorError::MathOverflow)? as u16;

        if tvl_ratio_bps < 8500 { // dropped below 85% of 24h ago = >15% drop
            // Auto-halt the allocator
            let allocator = &mut ctx.accounts.allocator;
            allocator.halted = true;
            // Still record the rebalance for audit trail, but mark as rejected
        }
    }

    // Accrue management fee (1% annualized, per-slot basis)
    // Slots per year ≈ 78_840_000 (at 400ms/slot)
    let slots_since_last_fee = current_slot.saturating_sub(vault.last_mgmt_fee_slot);
    if slots_since_last_fee > 0 && vault.total_assets > 0 {
        // mgmt_fee = total_assets * 0.01 * (slots_elapsed / slots_per_year)
        let fee = (vault.total_assets as u128)
            .checked_mul(slots_since_last_fee as u128)
            .ok_or(AllocatorError::MathOverflow)?
            .checked_mul(100) // 1% = 100 bps
            .ok_or(AllocatorError::MathOverflow)?
            .checked_div(78_840_000u128 * 10000) // slots_per_year * bps_denominator
            .ok_or(AllocatorError::MathOverflow)? as u64;

        if fee > 0 {
            vault.total_assets = vault.total_assets.saturating_sub(fee);

            // Transfer fee tokens from vault USDC to treasury USDC
            let allocator_seeds = &[b"allocator".as_ref(), &[ctx.accounts.allocator.bump]];
            anchor_spl::token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    anchor_spl::token::Transfer {
                        from: ctx.accounts.vault_usdc.to_account_info(),
                        to: ctx.accounts.treasury_usdc.to_account_info(),
                        authority: ctx.accounts.allocator.to_account_info(),
                    },
                    &[allocator_seeds],
                ),
                fee,
            )?;

            let treasury = &mut ctx.accounts.treasury;
            treasury.total_fees_collected = treasury.total_fees_collected
                .checked_add(fee)
                .ok_or(AllocatorError::MathOverflow)?;
        }
        vault.last_mgmt_fee_slot = current_slot;
    }

    // Update 24h equity snapshot (keeper updates once per ~216,000 slots = 24h)
    let slots_24h = 216_000u64;
    if current_slot.saturating_sub(vault.last_rebalance_slot) >= slots_24h
        || vault.equity_24h_ago == 0
    {
        vault.equity_24h_ago = equity_snapshot;
    }

    // Record rebalance with previous weights
    let record = &mut ctx.accounts.rebalance_record;
    record.risk_vault = vault.key();
    record.counter = vault.rebalance_counter;
    record.slot = current_slot;
    record.previous_weights = vault.current_weights.clone();
    record.new_weights = new_weights.clone();
    record.ai_reasoning_hash = ai_reasoning_hash;
    record.approved = !ctx.accounts.allocator.halted; // false if auto-halted above
    record.bump = ctx.bumps.rebalance_record;

    // Update current weights on vault
    vault.current_weights = new_weights;
    vault.last_rebalance_slot = current_slot;
    vault.rebalance_counter = vault.rebalance_counter.wrapping_add(1);

    Ok(())
}

#[derive(Accounts)]
#[instruction(new_weights: Vec<u16>, equity_snapshot: u64, ai_reasoning_hash: Vec<u8>)]
pub struct Rebalance<'info> {
    #[account(
        mut,
        seeds = [b"allocator"],
        bump = allocator.bump,
    )]
    pub allocator: Account<'info, Allocator>,
    #[account(
        mut,
        seeds = [b"vault", &[risk_vault.risk_level.as_u8()]],
        bump = risk_vault.bump,
    )]
    pub risk_vault: Account<'info, RiskVault>,
    #[account(
        init,
        payer = keeper,
        space = 8 + RebalanceRecord::INIT_SPACE,
        seeds = [b"rebalance", risk_vault.key().as_ref(), &risk_vault.rebalance_counter.to_le_bytes()],
        bump
    )]
    pub rebalance_record: Account<'info, RebalanceRecord>,
    #[account(
        mut,
        constraint = keeper.key() == allocator.keeper_authority @ AllocatorError::UnauthorizedKeeper
    )]
    pub keeper: Signer<'info>,
    // Token accounts for management fee transfer
    #[account(mut)]
    pub vault_usdc: Account<'info, anchor_spl::token::TokenAccount>,
    #[account(mut)]
    pub treasury_usdc: Account<'info, anchor_spl::token::TokenAccount>,
    #[account(
        mut,
        seeds = [b"treasury"],
        bump = treasury.bump,
    )]
    pub treasury: Account<'info, Treasury>,
    pub token_program: Program<'info, anchor_spl::token::Token>,
    pub system_program: Program<'info, System>,
}
```

- [ ] **Step 2: Add emergency_halt and resume instructions**

```rust
pub fn emergency_halt(ctx: Context<AdminAction>) -> Result<()> {
    require!(
        ctx.accounts.admin.key() == ctx.accounts.allocator.admin,
        AllocatorError::UnauthorizedAdmin
    );
    ctx.accounts.allocator.halted = true;
    Ok(())
}

pub fn resume(ctx: Context<AdminAction>) -> Result<()> {
    require!(
        ctx.accounts.admin.key() == ctx.accounts.allocator.admin,
        AllocatorError::UnauthorizedAdmin
    );
    // TODO: verify all risk metrics within bounds before resuming
    ctx.accounts.allocator.halted = false;
    Ok(())
}

pub fn update_keeper_authority(
    ctx: Context<AdminAction>,
    new_keeper: Pubkey,
) -> Result<()> {
    require!(
        ctx.accounts.admin.key() == ctx.accounts.allocator.admin,
        AllocatorError::UnauthorizedAdmin
    );
    ctx.accounts.allocator.keeper_authority = new_keeper;
    Ok(())
}
```

```rust
#[derive(Accounts)]
pub struct AdminAction<'info> {
    #[account(
        mut,
        seeds = [b"allocator"],
        bump = allocator.bump,
    )]
    pub allocator: Account<'info, Allocator>,
    #[account(mut)]
    pub admin: Signer<'info>,
}
```

- [ ] **Step 3: Write tests for rebalance guardrails, emergency halt, and keeper auth**

Add to `tests/allocator.ts`:
```typescript
it('rejects rebalance from non-keeper', async () => {
  // ... attempt rebalance with wrong signer, expect error
})

it('rejects rebalance when halted', async () => {
  // ... halt, attempt rebalance, expect AllocatorHalted error
})

it('halts and resumes', async () => {
  // ... halt, verify halted = true, resume, verify halted = false
})

it('rejects rebalance weights that dont sum to 10000', async () => {
  // ... send weights summing to 8000, expect InvalidWeightSum error
})

it('rejects rebalance when drawdown exceeds max', async () => {
  // ... set equity below peak beyond max_drawdown_bps, expect DrawdownExceeded
})
```

- [ ] **Step 4: Build and test**

```bash
anchor build && anchor test
```

- [ ] **Step 5: Commit**

```bash
git add programs/ tests/
git commit -m "feat(allocator): add rebalance with guardrails, emergency halt, keeper auth"
```

---

### Task 12b: Update Guardrails and Keeper Lease Instructions

**Files:**
- Modify: `programs/allocator/src/lib.rs`

- [ ] **Step 1: Add update_guardrails instruction with timelock**

```rust
pub fn update_guardrails(
    ctx: Context<UpdateGuardrails>,
    new_max_drawdown_bps: Option<u16>,
    new_max_perp_bps: Option<u16>,
    new_redemption_period_slots: Option<u64>,
) -> Result<()> {
    let vault = &mut ctx.accounts.risk_vault;

    // Can only tighten guardrails (reduce limits), never loosen beyond init
    if let Some(new_dd) = new_max_drawdown_bps {
        require!(new_dd <= vault.max_drawdown_bps, AllocatorError::CannotLoosenGuardrails);
        vault.max_drawdown_bps = new_dd;
    }
    if let Some(new_perp) = new_max_perp_bps {
        require!(new_perp <= vault.max_perp_allocation_bps, AllocatorError::CannotLoosenGuardrails);
        vault.max_perp_allocation_bps = new_perp;
    }
    if let Some(new_redemption) = new_redemption_period_slots {
        // Longer redemption = tighter (more protective)
        require!(new_redemption >= vault.redemption_period_slots, AllocatorError::CannotLoosenGuardrails);
        vault.redemption_period_slots = new_redemption;
    }

    Ok(())
}
```

```rust
#[derive(Accounts)]
pub struct UpdateGuardrails<'info> {
    #[account(
        seeds = [b"allocator"],
        bump = allocator.bump,
        has_one = admin @ AllocatorError::UnauthorizedAdmin,
    )]
    pub allocator: Account<'info, Allocator>,
    #[account(
        mut,
        seeds = [b"vault", &[risk_vault.risk_level.as_u8()]],
        bump = risk_vault.bump,
    )]
    pub risk_vault: Account<'info, RiskVault>,
    pub admin: Signer<'info>,
}
```

Note: Full 24h timelock implementation (storing pending changes, separate execute instruction) deferred to post-hackathon. For Phase 1, admin updates are immediate but can-only-tighten constraint provides safety.

- [ ] **Step 2: Add keeper lease instructions**

```rust
pub fn acquire_lease(ctx: Context<AcquireLease>) -> Result<()> {
    let lease = &mut ctx.accounts.keeper_lease;
    let current_slot = Clock::get()?.slot;

    // Check if existing lease is still active
    if lease.keeper != Pubkey::default()
        && lease.lease_expiry_slot > current_slot
        && lease.keeper != ctx.accounts.keeper.key()
    {
        return err!(AllocatorError::LeaseConflict);
    }

    // Acquire or renew lease (2 * cycle_slots ≈ 20 min at 10min cycles)
    let cycle_slots = 15_000u64; // ~10 min at 400ms/slot
    lease.keeper = ctx.accounts.keeper.key();
    lease.lease_expiry_slot = current_slot + (2 * cycle_slots);
    lease.heartbeat_slot = current_slot;
    lease.bump = ctx.bumps.keeper_lease;

    Ok(())
}

pub fn heartbeat(ctx: Context<Heartbeat>) -> Result<()> {
    let lease = &mut ctx.accounts.keeper_lease;
    let current_slot = Clock::get()?.slot;

    require!(
        ctx.accounts.keeper.key() == lease.keeper,
        AllocatorError::UnauthorizedKeeper
    );

    let cycle_slots = 15_000u64;
    lease.heartbeat_slot = current_slot;
    lease.lease_expiry_slot = current_slot + (2 * cycle_slots);

    Ok(())
}

#[derive(Accounts)]
pub struct AcquireLease<'info> {
    #[account(
        init_if_needed,
        payer = keeper,
        space = 8 + KeeperLease::INIT_SPACE,
        seeds = [b"lease"],
        bump
    )]
    pub keeper_lease: Account<'info, KeeperLease>,
    #[account(
        seeds = [b"allocator"],
        bump = allocator.bump,
        constraint = keeper.key() == allocator.keeper_authority @ AllocatorError::UnauthorizedKeeper
    )]
    pub allocator: Account<'info, Allocator>,
    #[account(mut)]
    pub keeper: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Heartbeat<'info> {
    #[account(
        mut,
        seeds = [b"lease"],
        bump = keeper_lease.bump,
    )]
    pub keeper_lease: Account<'info, KeeperLease>,
    pub keeper: Signer<'info>,
}
```

- [ ] **Step 3: Write tests for guardrail updates and lease**

```typescript
it('allows tightening max drawdown', async () => {
  // Set drawdown from 200 (2%) to 150 (1.5%)
  await program.methods.updateGuardrails(150, null, null).accounts({...}).rpc()
  const vault = await program.account.riskVault.fetch(vaultPda)
  expect(vault.maxDrawdownBps).to.equal(150)
})

it('rejects loosening max drawdown', async () => {
  // Try to set drawdown from 150 to 300 — should fail
  await expect(program.methods.updateGuardrails(300, null, null).accounts({...}).rpc())
    .to.be.rejectedWith('CannotLoosenGuardrails')
})

it('acquires keeper lease', async () => {
  await program.methods.acquireLease().accounts({...}).rpc()
  const lease = await program.account.keeperLease.fetch(leasePda)
  expect(lease.keeper.toBase58()).to.equal(keeperAuthority.publicKey.toBase58())
})

it('rejects second keeper when lease is active', async () => {
  const rogue = Keypair.generate()
  await expect(program.methods.acquireLease().accounts({
    keeper: rogue.publicKey, ...
  }).signers([rogue]).rpc()).to.be.rejectedWith('LeaseConflict')
})
```

- [ ] **Step 4: Build and test**

```bash
anchor build && anchor test
```

- [ ] **Step 5: Commit**

```bash
git add programs/ tests/
git commit -m "feat(allocator): add update_guardrails (tighten-only) and keeper lease mutex"
```

---

### Phase 2 Quality Gate

Before proceeding to Phase 3, verify:

- [ ] `anchor build` succeeds with no warnings
- [ ] All Anchor tests pass: `anchor test`
- [ ] Instructions implemented: initialize_allocator, initialize_risk_vault, initialize_treasury, deposit, request_withdraw, withdraw, rebalance, update_guardrails, update_keeper_authority, emergency_halt, resume, acquire_lease, heartbeat, withdraw_treasury
- [ ] Guardrails enforced: weight sum, per-strategy caps, max shift (20%), drawdown check, rebalance interval, keeper auth, oracle divergence (1%), TVL emergency halt (15% in 24h)
- [ ] Share pricing: ERC-4626 pro-rata, worse-of request/current price on withdrawal
- [ ] Fees: 1% management (accrued in rebalance), 10% performance (HWM per user)
- [ ] Two-phase withdrawal with redemption period, request_time_share_price recorded
- [ ] Emergency halt freezes deposits, accelerates redemptions
- [ ] Share mint PDA initialized per vault tier
- [ ] Treasury PDA initialized with withdraw_treasury instruction
- [ ] Keeper lease: acquire, heartbeat, conflict detection
- [ ] update_guardrails: tighten-only constraint enforced
- [ ] Rebalance records previous_weights from vault state

**If any check fails → fix before proceeding to Phase 3.**

---

## Chunk 3: Backend Drift

### Task 13: Backend Drift Package Setup

**Files:**
- Modify: `packages/backend-drift/package.json`
- Create: `packages/backend-drift/src/index.ts`
- Create: `packages/backend-drift/src/drift-connection.ts`

- [ ] **Step 1: Install Drift SDK dependencies**

```bash
cd packages/backend-drift
pnpm add @drift-labs/sdk @solana/web3.js @coral-xyz/anchor
```

- [ ] **Step 2: Create Drift connection wrapper**

Create `packages/backend-drift/src/drift-connection.ts`:
```typescript
import { DriftClient, initialize } from '@drift-labs/sdk'
import { Connection, PublicKey } from '@solana/web3.js'
import { AnchorProvider } from '@coral-xyz/anchor'

export interface DriftConnectionConfig {
  rpcUrl: string
  walletKeypair: Uint8Array  // keeper wallet
  env?: 'devnet' | 'mainnet-beta'
}

export async function createDriftClient(
  config: DriftConnectionConfig,
): Promise<DriftClient> {
  const connection = new Connection(config.rpcUrl, 'confirmed')
  const env = config.env ?? 'devnet'

  // Initialize Drift SDK constants (program IDs, etc.)
  const sdkConfig = initialize({ env })

  // Create provider and client
  // Implementation depends on Drift SDK version — check Context7 docs during implementation
  // This is a placeholder for the connection setup pattern

  throw new Error('Drift client initialization — implement with Context7 SDK docs')
}
```

Note: Exact Drift SDK initialization API should be verified via Context7 MCP during implementation. The SDK version may have changed.

- [ ] **Step 3: Commit scaffold**

```bash
git add packages/backend-drift/
git commit -m "chore(backend-drift): scaffold package with Drift SDK dependency"
```

---

### Task 14: DriftLendingBackend

**Files:**
- Create: `packages/backend-drift/src/backends/lending.ts`
- Create: `packages/backend-drift/src/backends/lending.test.ts`

- [ ] **Step 1: Write failing tests using MockYieldBackend as reference pattern**

Create `packages/backend-drift/src/backends/lending.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { DriftLendingBackend } from './lending'
import type { BackendCapabilities } from '@nanuqfi/core'

// Unit tests use a mock Drift client
// Integration tests (test:int) hit devnet

describe('DriftLendingBackend', () => {
  let backend: DriftLendingBackend

  beforeEach(() => {
    backend = new DriftLendingBackend({
      // Mock config for unit tests
      mockMode: true,
      mockApy: 0.08,
    })
  })

  it('has correct name', () => {
    expect(backend.name).toBe('drift-lending')
  })

  it('has correct capabilities', () => {
    const caps = backend.capabilities
    expect(caps.supportedAssets).toContain('USDC')
    expect(caps.supportsLeverage).toBe(false)
    expect(caps.isDeltaNeutral).toBe(false)
    expect(caps.liquidationRisk).toBe('none')
    expect(caps.withdrawalDelay).toBe(0)
  })

  it('returns yield estimate', async () => {
    const estimate = await backend.getExpectedYield()
    expect(estimate.annualizedApy).toBeGreaterThan(0)
    expect(estimate.source).toBe('drift-lending')
    expect(estimate.asset).toBe('USDC')
  })

  it('returns risk metrics with low volatility', async () => {
    const risk = await backend.getRisk()
    expect(risk.volatilityScore).toBeLessThan(0.3) // lending is low vol
    expect(risk.liquidationRisk).toBe('none')
  })
})
```

- [ ] **Step 2: Implement DriftLendingBackend**

Create `packages/backend-drift/src/backends/lending.ts`:
```typescript
import type {
  YieldBackend,
  BackendCapabilities,
  YieldEstimate,
  RiskMetrics,
  PositionState,
} from '@nanuqfi/core'

interface DriftLendingConfig {
  mockMode?: boolean
  mockApy?: number
  // Real mode config:
  // driftClient?: DriftClient
}

export class DriftLendingBackend implements YieldBackend {
  readonly name = 'drift-lending'
  readonly capabilities: BackendCapabilities = {
    supportedAssets: ['USDC'],
    supportsLeverage: false,
    maxLeverage: 1,
    isDeltaNeutral: false,
    hasAutoExit: false,
    liquidationRisk: 'none',
    minDeposit: 1_000_000n,        // 1 USDC
    maxDeposit: 10_000_000_000_000n, // 10M USDC
    withdrawalDelay: 0,
  }

  private readonly config: DriftLendingConfig

  constructor(config: DriftLendingConfig = {}) {
    this.config = config
  }

  async getExpectedYield(): Promise<YieldEstimate> {
    if (this.config.mockMode) {
      return {
        annualizedApy: this.config.mockApy ?? 0.08,
        source: this.name,
        asset: 'USDC',
        confidence: 0.95,
        timestamp: Date.now(),
      }
    }

    // Real implementation: query Drift spot market for USDC borrow/lend rates
    // const spotMarket = await this.config.driftClient.getSpotMarketAccount(0) // USDC = 0
    // const depositRate = calculateDepositRate(spotMarket)
    throw new Error('Real Drift lending rate query — implement during integration')
  }

  async getRisk(): Promise<RiskMetrics> {
    return {
      volatilityScore: 0.05,      // lending is very stable
      maxDrawdown: 0.001,          // near zero for lending
      liquidationRisk: 'none',
      correlationToMarket: 0.1,    // minimal correlation
    }
  }

  async estimateSlippage(_amount: bigint): Promise<number> {
    return 0 // no slippage for lending deposits
  }

  async deposit(_amount: bigint): Promise<string> {
    if (this.config.mockMode) return `mock-tx-${this.name}-deposit`
    // Real: CPI into Drift spot deposit
    throw new Error('Drift lending deposit — implement during integration')
  }

  async withdraw(_amount: bigint): Promise<string> {
    if (this.config.mockMode) return `mock-tx-${this.name}-withdraw`
    throw new Error('Drift lending withdraw — implement during integration')
  }

  async getPosition(): Promise<PositionState> {
    if (this.config.mockMode) {
      return {
        backend: this.name,
        asset: 'USDC',
        depositedAmount: 0n,
        currentValue: 0n,
        unrealizedPnl: 0n,
        entryTimestamp: 0,
        isActive: false,
      }
    }
    throw new Error('Drift lending position query — implement during integration')
  }
}
```

- [ ] **Step 3: Run tests**

```bash
cd packages/backend-drift && pnpm vitest run
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/backend-drift/
git commit -m "feat(backend-drift): add DriftLendingBackend with mock mode"
```

---

### Task 15a: DriftInsuranceBackend

**Files:**
- Create: `packages/backend-drift/src/backends/insurance.ts`
- Create: `packages/backend-drift/src/backends/insurance.test.ts`

Follow same pattern as Task 14 (DriftLendingBackend). Key differences:
- `name: 'drift-insurance'`
- `liquidationRisk: 'low'` (insurance fund can have drawdowns from liquidation events)
- `withdrawalDelay: 86400` (unstaking period ~24h)
- Auto-exit trigger: Drift insurance fund drawdown >30%
- Mock `getExpectedYield` returns ~12% APY
- Mock `getRisk` volatilityScore: 0.15

- [ ] **Step 1: Write failing tests** (capability shape, yield estimate, risk metrics, auto-exit condition)
- [ ] **Step 2: Implement DriftInsuranceBackend**
- [ ] **Step 3: Run tests** → `pnpm vitest run src/backends/insurance.test.ts`
- [ ] **Step 4: Commit** → `git commit -m "feat(backend-drift): add DriftInsuranceBackend"`

---

### Task 15b: DriftBasisTradeBackend

**Files:**
- Create: `packages/backend-drift/src/backends/basis-trade.ts`
- Create: `packages/backend-drift/src/backends/basis-trade.test.ts`

Key differences:
- `name: 'drift-basis'`
- `isDeltaNeutral: true` (long spot + short perp)
- `hasAutoExit: true`
- `liquidationRisk: 'low'`
- Auto-exit trigger: funding flips negative for >4h continuously
- Mock needs `fundingRateHistory` to test auto-exit logic
- Mock `getExpectedYield` returns ~20% APY with funding rate data
- `estimateSlippage` should account for both spot and perp leg

- [ ] **Step 1: Write failing tests** (including auto-exit: funding negative 4h → triggers exit)
- [ ] **Step 2: Implement DriftBasisTradeBackend**
- [ ] **Step 3: Run tests** → `pnpm vitest run src/backends/basis-trade.test.ts`
- [ ] **Step 4: Commit** → `git commit -m "feat(backend-drift): add DriftBasisTradeBackend with funding auto-exit"`

---

### Task 15c: DriftFundingBackend

**Files:**
- Create: `packages/backend-drift/src/backends/funding.ts`
- Create: `packages/backend-drift/src/backends/funding.test.ts`

Key differences:
- `name: 'drift-funding'`
- `supportsLeverage: true`, `maxLeverage: 3`
- `liquidationRisk: 'medium'`
- `hasAutoExit: true`
- Auto-exit trigger: position PnL hits -2% (Aggressive: -5%)
- NOT delta-neutral — directional funding rate capture
- Requires 4h of consistent positive funding before entry (whipsaw protection)

- [ ] **Step 1: Write failing tests** (auto-exit on PnL, entry requires 4h positive funding)
- [ ] **Step 2: Implement DriftFundingBackend**
- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit** → `git commit -m "feat(backend-drift): add DriftFundingBackend with PnL auto-exit"`

---

### Task 15d: DriftJitoDNBackend

**Files:**
- Create: `packages/backend-drift/src/backends/jito-dn.ts`
- Create: `packages/backend-drift/src/backends/jito-dn.test.ts`

Key differences:
- `name: 'drift-jito-dn'`
- `isDeltaNeutral: true` (JitoSOL staking + short SOL perp)
- `supportedAssets: ['USDC', 'JitoSOL']`
- `liquidationRisk: 'low'`
- `hasAutoExit: true`
- Auto-exit trigger: SOL borrow rate exceeds JitoSOL staking yield
- Note: JitoSOL acquisition is off-chain via Jupiter (keeper handles swap)

- [ ] **Step 1: Write failing tests** (auto-exit on borrow rate vs staking yield)
- [ ] **Step 2: Implement DriftJitoDNBackend**
- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit** → `git commit -m "feat(backend-drift): add DriftJitoDNBackend with borrow rate auto-exit"`

---

### Task 15e: Backend Drift Package Exports

- [ ] **Step 1: Create `packages/backend-drift/src/index.ts`**

```typescript
export { DriftLendingBackend } from './backends/lending'
export { DriftInsuranceBackend } from './backends/insurance'
export { DriftBasisTradeBackend } from './backends/basis-trade'
export { DriftFundingBackend } from './backends/funding'
export { DriftJitoDNBackend } from './backends/jito-dn'
export { createDriftClient } from './drift-connection'
export type { DriftConnectionConfig } from './drift-connection'
```

- [ ] **Step 2: Run all backend-drift tests**

```bash
cd packages/backend-drift && pnpm vitest run
```
Expected: ALL PASS

- [ ] **Step 3: Build full workspace**

```bash
pnpm turbo build && pnpm turbo test
```

- [ ] **Step 4: Commit** → `git commit -m "feat(backend-drift): finalize exports for @nanuqfi/backend-drift v0.1.0"`

---

### Phase 3 Quality Gate

- [ ] All backend-drift tests pass
- [ ] Each backend correctly implements `YieldBackend` interface
- [ ] Mock mode works for all backends (no network calls in unit tests)
- [ ] Capabilities accurately reflect each strategy's risk profile
- [ ] Build succeeds: `pnpm turbo build`
- [ ] All core + backend-drift tests pass: `pnpm turbo test`

**If any check fails → fix before proceeding to Phase 4.**

---

## Chunk 4: AI Keeper

### Task 16: Keeper Repo Setup

**Files (in separate nanuqfi-keeper repo):**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `Dockerfile`
- Create: `src/index.ts`
- Create: `src/config.ts`

- [ ] **Step 1: Clone keeper repo and scaffold**

```bash
cd ~/local-dev
gh repo clone nanuqfi/nanuqfi-keeper
cd nanuqfi-keeper
pnpm init
pnpm add @nanuqfi/core @nanuqfi/backend-drift @drift-labs/sdk @solana/web3.js @coral-xyz/anchor
pnpm add -D typescript vitest @types/node
```

- [ ] **Step 2: Create config with multi-RPC failover**

Create `src/config.ts`:
```typescript
export interface KeeperConfig {
  rpcUrls: string[]            // ordered by priority (Helius → Triton → public)
  keeperKeypairPath: string
  cycleIntervalMs: number      // 5-15 min default
  aiCycleIntervalMs: number    // 1-4 hours
  aiApiKey: string
  aiModel: string              // claude-sonnet-4-6 default
  aiMaxCallsPerHour: number
  aiBudgetPerDay: number       // USD
  alertTelegramToken?: string
  alertTelegramChatId?: string
}

export function loadConfig(): KeeperConfig {
  return {
    rpcUrls: [
      process.env.RPC_URL_PRIMARY ?? '',
      process.env.RPC_URL_FALLBACK ?? '',
      'https://api.devnet.solana.com',
    ].filter(Boolean),
    keeperKeypairPath: process.env.KEEPER_KEYPAIR_PATH ?? '',
    cycleIntervalMs: Number(process.env.CYCLE_INTERVAL_MS ?? 600_000), // 10 min
    aiCycleIntervalMs: Number(process.env.AI_CYCLE_INTERVAL_MS ?? 7_200_000), // 2 hours
    aiApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    aiModel: process.env.AI_MODEL ?? 'claude-sonnet-4-6',
    aiMaxCallsPerHour: Number(process.env.AI_MAX_CALLS_PER_HOUR ?? 10),
    aiBudgetPerDay: Number(process.env.AI_BUDGET_PER_DAY ?? 5),
    alertTelegramToken: process.env.TELEGRAM_BOT_TOKEN,
    alertTelegramChatId: process.env.TELEGRAM_CHAT_ID,
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: scaffold keeper repo with config and dependencies"
git push -u origin main
```

---

### Task 17: Algorithm Engine

**Files:**
- Create: `src/engine/algorithm-engine.ts`
- Create: `src/engine/algorithm-engine.test.ts`
- Create: `src/engine/scoring.ts`
- Create: `src/engine/scoring.test.ts`

- [ ] **Step 1: Write failing tests for scoring function**

Create `src/engine/scoring.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { computeRiskAdjustedScore, rankYieldSources } from './scoring'

describe('computeRiskAdjustedScore', () => {
  it('returns higher score for higher APY with same volatility', () => {
    const a = computeRiskAdjustedScore(0.20, 0.1)
    const b = computeRiskAdjustedScore(0.10, 0.1)
    expect(a).toBeGreaterThan(b)
  })

  it('returns higher score for lower volatility with same APY', () => {
    const a = computeRiskAdjustedScore(0.15, 0.05)
    const b = computeRiskAdjustedScore(0.15, 0.20)
    expect(a).toBeGreaterThan(b)
  })

  it('handles zero volatility without division by zero', () => {
    const score = computeRiskAdjustedScore(0.10, 0)
    expect(Number.isFinite(score)).toBe(true)
    expect(score).toBeGreaterThan(0)
  })

  it('returns 0 for zero APY', () => {
    const score = computeRiskAdjustedScore(0, 0.1)
    expect(score).toBe(0)
  })
})

describe('rankYieldSources', () => {
  it('ranks by risk-adjusted score descending', () => {
    const sources = [
      { name: 'low', apy: 0.08, volatility: 0.1 },
      { name: 'high', apy: 0.25, volatility: 0.15 },
      { name: 'mid', apy: 0.15, volatility: 0.08 },
    ]
    const ranked = rankYieldSources(sources)
    expect(ranked[0].name).toBe('mid')   // 0.15/0.08 = 1.875
    expect(ranked[1].name).toBe('high')  // 0.25/0.15 = 1.667
    expect(ranked[2].name).toBe('low')   // 0.08/0.1 = 0.8
  })
})
```

- [ ] **Step 2: Implement scoring**

Create `src/engine/scoring.ts`:
```typescript
export function computeRiskAdjustedScore(apy: number, volatility: number): number {
  if (apy <= 0) return 0
  const safeVol = Math.max(volatility, 0.001) // floor to prevent division by zero
  return apy / safeVol
}

interface YieldSource {
  name: string
  apy: number
  volatility: number
}

interface RankedSource extends YieldSource {
  riskAdjustedScore: number
}

export function rankYieldSources(sources: YieldSource[]): RankedSource[] {
  return sources
    .map(s => ({
      ...s,
      riskAdjustedScore: computeRiskAdjustedScore(s.apy, s.volatility),
    }))
    .sort((a, b) => b.riskAdjustedScore - a.riskAdjustedScore)
}
```

- [ ] **Step 3: Run scoring tests**

```bash
pnpm vitest run src/engine/scoring.test.ts
```
Expected: PASS

- [ ] **Step 4: Write tests for auto-exit triggers**

Create `src/engine/auto-exit.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { checkAutoExit, AutoExitTrigger } from './auto-exit'

describe('checkAutoExit', () => {
  it('triggers basis exit when funding negative >4h', () => {
    const fundingHistory = Array(17).fill(-0.001) // 17 x 15min = 4.25h negative
    const result = checkAutoExit('drift-basis', { fundingHistory })
    expect(result.shouldExit).toBe(true)
    expect(result.reason).toContain('funding negative')
  })

  it('does not trigger basis exit when funding negative <4h', () => {
    const fundingHistory = Array(10).fill(-0.001) // 2.5h
    const result = checkAutoExit('drift-basis', { fundingHistory })
    expect(result.shouldExit).toBe(false)
  })

  it('triggers funding exit when PnL hits -2%', () => {
    const result = checkAutoExit('drift-funding', {
      unrealizedPnlPercent: -0.025,
      riskLevel: 'moderate',
    })
    expect(result.shouldExit).toBe(true)
  })

  it('uses -5% threshold for aggressive funding', () => {
    const result = checkAutoExit('drift-funding', {
      unrealizedPnlPercent: -0.03,
      riskLevel: 'aggressive',
    })
    expect(result.shouldExit).toBe(false) // -3% < -5% threshold
  })

  it('triggers jito-dn exit when borrow > staking yield', () => {
    const result = checkAutoExit('drift-jito-dn', {
      solBorrowRate: 0.08,
      jitoStakingYield: 0.07,
    })
    expect(result.shouldExit).toBe(true)
  })

  it('triggers insurance exit when fund drawdown >30%', () => {
    const result = checkAutoExit('drift-insurance', {
      insuranceFundDrawdown: 0.35,
    })
    expect(result.shouldExit).toBe(true)
  })
})
```

- [ ] **Step 5: Implement auto-exit trigger logic**

Create `src/engine/auto-exit.ts` with the rules from the spec.

- [ ] **Step 6: Write tests for AlgorithmEngine**

Key behaviors to test:
- Fetches yields from all registered backends
- Scores and ranks sources
- Checks auto-exit triggers and excludes sources that trigger exit
- Proposes valid weights within guardrails
- Handles backend failures gracefully (circuit breaker)

- [ ] **Step 5: Implement AlgorithmEngine**

Core loop: fetch state → score → check triggers → propose weights → validate → submit or skip

- [ ] **Step 6: Run all engine tests**

```bash
pnpm vitest run src/engine/
```

- [ ] **Step 7: Commit**

```bash
git add src/engine/ && git commit -m "feat: add algorithm engine with scoring and auto-exit triggers"
```

---

### Task 18: AI Reasoning Layer

**Files:**
- Create: `src/ai/ai-provider.ts`
- Create: `src/ai/ai-provider.test.ts`
- Create: `src/ai/prompt-builder.ts`
- Create: `src/ai/response-validator.ts`
- Create: `src/ai/response-validator.test.ts`

- [ ] **Step 1: Write tests for response validation (hallucination rejection)**

Key test cases:
- Valid response with correct schema → accepted
- Weights don't sum to 100 → rejected
- Negative weights → rejected
- Missing required fields → rejected
- Non-JSON response → rejected
- Response recommends basis when funding is negative → flagged

- [ ] **Step 2: Implement response validator**
- [ ] **Step 3: Implement prompt builder (constructs AI context from market data)**
- [ ] **Step 4: Implement AI provider with rate limiting and circuit breaker**
- [ ] **Step 5: Run tests**
- [ ] **Step 6: Commit**

```bash
git add src/ai/ && git commit -m "feat: add AI reasoning layer with response validation and rate limiting"
```

---

### Task 19: Health Monitor and REST API

**Files:**
- Create: `src/health/monitor.ts`
- Create: `src/health/api.ts`
- Create: `src/health/api.test.ts`

- [ ] **Step 1: Implement health monitor (heartbeat, cycle tracking, alerting)**
- [ ] **Step 2: Implement REST API (read-only endpoints from spec Section 13)**

Endpoints:
- `GET /v1/health`
- `GET /v1/vaults`
- `GET /v1/vaults/:riskLevel`
- `GET /v1/vaults/:riskLevel/history`
- `GET /v1/vaults/:riskLevel/decisions`
- `GET /v1/yields`
- `GET /v1/status`

- [ ] **Step 3: Write API tests**
- [ ] **Step 4: Commit**

```bash
git add src/health/ && git commit -m "feat: add health monitor and REST API for dashboard transparency"
```

---

### Task 20: Keeper Main Loop and Boot Sequence

**Files:**
- Create: `src/keeper.ts`
- Create: `src/keeper.test.ts`

- [ ] **Step 1: Implement boot sequence** (from spec Section 7)

```
1. Verify RPC connectivity
2. Check lease PDA
3. Reconcile on-chain state
4. Check pending withdrawals
5. Start cycle loop
```

- [ ] **Step 2: Implement main cycle loop**

```
Per cycle:
  1. Reconcile state
  2. Run algorithm engine
  3. Check AI triggers → run AI if needed
  4. Propose rebalance (if needed)
  5. Write heartbeat
  6. Sleep
```

- [ ] **Step 3: Add cycle timeout (60s max)**
- [ ] **Step 4: Add watchdog integration**
- [ ] **Step 5: Write integration tests**
- [ ] **Step 6: Create Dockerfile**

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod
COPY dist/ ./dist/
CMD ["node", "dist/index.js"]
```

- [ ] **Step 7: Commit**

```bash
git add src/keeper.ts src/keeper.test.ts Dockerfile
git commit -m "feat: add keeper main loop with boot sequence and watchdog"
```

---

### Phase 4 Quality Gate

- [ ] All keeper tests pass: `pnpm vitest run`
- [ ] Algorithm engine: scoring, ranking, auto-exit triggers all tested
- [ ] AI layer: response validation rejects hallucinations, rate limiting works, degrades to algo-only
- [ ] REST API: all 7 endpoints return correct data
- [ ] Boot sequence: RPC check, lease check, reconciliation
- [ ] Cycle timeout: stuck cycles killed after 60s
- [ ] Mock mode: full keeper cycle runs without network
- [ ] Docker build succeeds: `docker build -t nanuqfi-keeper .`

**If any check fails → fix before proceeding to Phase 5.**

---

## Chunk 5: Frontend + Submission

### Task 21: Frontend Repo Setup

**Files (in separate nanuqfi-app repo):**
- Create: Next.js project with App Router
- Create: Tailwind config
- Create: Custom component system foundation

- [ ] **Step 1: Clone and scaffold**

```bash
cd ~/local-dev
gh repo clone nanuqfi/nanuqfi-app
cd nanuqfi-app
pnpm create next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*"
pnpm add @nanuqfi/core @nanuqfi/backend-drift @solana/wallet-adapter-react @solana/wallet-adapter-wallets @solana/web3.js
```

- [ ] **Step 2: Create brand guidelines document** (MUST exist before UI work)

Create `docs/brand-guidelines.md` with: color palette, typography, spacing scale, motion language, component design principles. Use `frontend-design` skill for this.

- [ ] **Step 3: Set up Tailwind with brand tokens**
- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: scaffold frontend with Next.js, Tailwind, and brand guidelines"
git push -u origin main
```

---

### Task 22: Custom Component System

Build custom components (NO off-the-shelf UI libraries):
- [ ] Button (variants: primary, secondary, danger, ghost)
- [ ] Card (with header, body, footer slots)
- [ ] ProgressBar (for guardrail usage visualization)
- [ ] Badge (for risk levels, status indicators)
- [ ] DataTable (for positions, history)
- [ ] AllocationChart (pie/bar for vault breakdown)
- [ ] Skeleton (loading states)
- [ ] Toast (notifications)
- [ ] Modal (deposit/withdraw dialogs)
- [ ] WalletButton (wallet connect integration)

Each component: tests + Storybook-style docs. Use `frontend-design` skill.

---

### Task 23: Pages

- [ ] **Dashboard page** — portfolio overview, total APY, PnL chart
- [ ] **Vaults page** — three risk tier cards with live stats
- [ ] **Vault Detail page** — transparency layer (allocation breakdown, guardrails, keeper decisions)
- [ ] **Activity page** — rebalance history, withdrawal status

Each page connects to:
- On-chain data via `@nanuqfi/backend-drift`
- Keeper REST API for decision logs

---

### Task 23b: CI/CD Setup (All Repos)

**Files:**
- Create: `nanuqfi/.github/workflows/ci.yml`
- Create: `nanuqfi-keeper/.github/workflows/ci.yml`
- Create: `nanuqfi-app/.github/workflows/ci.yml`

- [ ] **Step 1: Core monorepo CI**

Create `.github/workflows/ci.yml`:
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build
      - run: pnpm turbo test
      - run: pnpm turbo lint

  anchor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: coral-xyz/anchor-action@v0.1
        with:
          anchor-version: '0.30.1'
      - run: anchor build
      - run: anchor test
```

- [ ] **Step 2: Keeper CI** (unit tests only, no secrets in CI)
- [ ] **Step 3: App CI** (build + lint)
- [ ] **Step 4: Commit and push CI configs to each repo**

---

### Task 24: Hackathon Submission Prep

- [ ] **Strategy documentation** — thesis, mechanics, risk management (from spec)
- [ ] **Demo video script** — max 3 minutes covering: problem → solution → architecture → demo → differentiation
- [ ] **Record demo video** — screen recording of deposit → vault detail → keeper cycle
- [ ] **Deploy to devnet** — allocator program + keeper + frontend on Vercel
- [ ] **Submit** — code repo, video, on-chain vault address, strategy docs

Deadline: April 6, 2026 23:59 UTC

---

### Phase 5 Quality Gate (Final)

- [ ] Frontend builds and deploys to Vercel
- [ ] Wallet connect → deposit → view vault → request withdraw flow works end-to-end
- [ ] Transparency UI shows real keeper decisions
- [ ] All repos have passing CI
- [ ] Strategy documentation complete
- [ ] Demo video recorded
- [ ] Devnet deployment live with on-chain verification
- [ ] Submission requirements met (video, docs, code, on-chain address)

---

## Post-Hackathon Evolution

After April 6, these are the next priorities (not part of this plan):

1. **Drift CPI integration** — replace mock mode with real Drift vault operations
2. **Real devnet testing** — keeper running live on devnet with real Drift vaults
3. **Mainnet deployment** — security review, upgrade authority → Squads multisig
4. **Additional backends** — Mango, Marginfi, Kamino (just implement `YieldBackend`)
5. **Approach 3 evolution** — regime detection, adaptive strategy switching
6. **Custom ML models** — Python microservice for alpha generation (open nuance)
