# Kamino Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `@nanuqfi/backend-kamino` — Kamino USDC lending backend with live mainnet rates via REST API and historical backtest data.

**Architecture:** Pure REST API integration with `api.kamino.finance` — no SDK dependency. Live rates from `/reserves/metrics`, historical from `/metrics/history`. Mock mode for offline tests. Same `YieldBackend` interface as Marginfi and Drift backends.

**Tech Stack:** TypeScript, Vitest, native `fetch()`

**Spec:** `docs/superpowers/specs/2026-04-05-kamino-backend-design.md`

---

### Task 1: Scaffold backend-kamino package

**Files:**
- Create: `packages/backend-kamino/package.json`
- Create: `packages/backend-kamino/tsconfig.json`
- Create: `packages/backend-kamino/src/index.ts`

- [ ] **Step 1: Create package.json**

Create `packages/backend-kamino/package.json`:

```json
{
  "name": "@nanuqfi/backend-kamino",
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
  "dependencies": {
    "@nanuqfi/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7",
    "vitest": "^3"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `packages/backend-kamino/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create placeholder index.ts**

Create `packages/backend-kamino/src/index.ts`:

```typescript
// @nanuqfi/backend-kamino — Kamino USDC lending via REST API
```

- [ ] **Step 4: Install and verify**

```bash
cd ~/local-dev/nanuqfi && pnpm install
```

- [ ] **Step 5: Commit**

```bash
cd ~/local-dev/nanuqfi
git add packages/backend-kamino/
git commit -m "chore(backend-kamino): scaffold package — zero-dep Kamino backend"
```

---

### Task 2: Create Kamino API client with cache

**Files:**
- Create: `packages/backend-kamino/src/utils/kamino-api.ts`
- Create: `packages/backend-kamino/src/utils/kamino-api.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/backend-kamino/src/utils/kamino-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fetchUsdcReserveMetrics,
  fetchHistoricalMetrics,
  clearKaminoCache,
  KAMINO_MAIN_MARKET,
  KAMINO_USDC_RESERVE,
  type KaminoReserveMetrics,
} from './kamino-api'

const MOCK_RESERVE_RESPONSE = [
  {
    reserve: KAMINO_USDC_RESERVE,
    liquidityToken: 'USDC',
    liquidityTokenMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    maxLtv: '0.8',
    borrowApy: '0.038',
    supplyApy: '0.021',
    totalSupply: '209000000',
    totalBorrow: '155000000',
    totalBorrowUsd: '155000000',
    totalSupplyUsd: '209000000',
  },
]

const MOCK_HISTORY_RESPONSE = {
  reserve: KAMINO_USDC_RESERVE,
  history: [
    {
      timestamp: '2026-01-01T00:00:00.000Z',
      metrics: { supplyInterestAPY: 0.045, borrowInterestAPY: 0.065, depositTvl: '50000000', borrowTvl: '35000000' },
    },
    {
      timestamp: '2026-01-02T00:00:00.000Z',
      metrics: { supplyInterestAPY: 0.048, borrowInterestAPY: 0.068, depositTvl: '51000000', borrowTvl: '36000000' },
    },
  ],
}

describe('fetchUsdcReserveMetrics', () => {
  beforeEach(() => {
    clearKaminoCache()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches USDC reserve from Kamino API', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_RESERVE_RESPONSE),
    } as Response)

    const metrics = await fetchUsdcReserveMetrics()

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/kamino-market/')
    )
    expect(metrics.supplyApy).toBe(0.021)
    expect(metrics.borrowApy).toBe(0.038)
    expect(metrics.totalSupplyUsd).toBe(209000000)
    expect(metrics.totalBorrowUsd).toBe(155000000)
    expect(metrics.availableLiquidityUsd).toBe(54000000)
    expect(metrics.utilization).toBeCloseTo(0.7416, 3)
  })

  it('throws if USDC reserve not found', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ reserve: 'other', liquidityToken: 'SOL' }]),
    } as Response)

    await expect(fetchUsdcReserveMetrics()).rejects.toThrow('USDC reserve not found')
  })

  it('throws on non-OK response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response)

    await expect(fetchUsdcReserveMetrics()).rejects.toThrow('Kamino API error: 500')
  })

  it('caches result within TTL', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_RESERVE_RESPONSE),
    } as Response)

    await fetchUsdcReserveMetrics()
    await fetchUsdcReserveMetrics()

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('re-fetches after cache expires', async () => {
    vi.useFakeTimers()
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_RESERVE_RESPONSE),
    } as Response)

    await fetchUsdcReserveMetrics()
    vi.advanceTimersByTime(61_000)
    await fetchUsdcReserveMetrics()

    expect(fetch).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})

describe('fetchHistoricalMetrics', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches and parses historical data', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_HISTORY_RESPONSE),
    } as Response)

    const points = await fetchHistoricalMetrics()

    expect(points).toHaveLength(2)
    expect(points[0]).toEqual({
      timestamp: new Date('2026-01-01T00:00:00.000Z').getTime(),
      supplyApy: 0.045,
      borrowApy: 0.065,
      tvlUsd: 50000000,
    })
  })

  it('throws on API error', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response)

    await expect(fetchHistoricalMetrics()).rejects.toThrow('Kamino API error: 404')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/local-dev/nanuqfi && pnpm --filter @nanuqfi/backend-kamino exec vitest run src/utils/kamino-api.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement Kamino API client**

Create `packages/backend-kamino/src/utils/kamino-api.ts`:

```typescript
/**
 * Kamino REST API client for lending rate data.
 *
 * Uses api.kamino.finance — no SDK dependency, pure HTTP.
 * Provides both live rates and historical data for backtesting.
 */

const DEFAULT_API_BASE = 'https://api.kamino.finance'

export const KAMINO_MAIN_MARKET = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF'
export const KAMINO_USDC_RESERVE = 'D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59'

export interface KaminoReserveMetrics {
  supplyApy: number
  borrowApy: number
  totalSupplyUsd: number
  totalBorrowUsd: number
  availableLiquidityUsd: number
  utilization: number
}

export interface KaminoHistoricalPoint {
  timestamp: number   // epoch ms
  supplyApy: number
  borrowApy: number
  tvlUsd: number
}

interface RawReserveEntry {
  reserve: string
  liquidityToken: string
  supplyApy: string
  borrowApy: string
  totalSupplyUsd: string
  totalBorrowUsd: string
}

interface RawHistoryEntry {
  timestamp: string
  metrics: {
    supplyInterestAPY: number
    borrowInterestAPY: number
    depositTvl: string
  }
}

interface RawHistoryResponse {
  reserve: string
  history: RawHistoryEntry[]
}

const CACHE_TTL_MS = 60_000

interface CacheEntry<T> {
  value: T
  timestamp: number
}

let metricsCache: CacheEntry<KaminoReserveMetrics> | null = null

export function clearKaminoCache(): void {
  metricsCache = null
}

function isCacheValid<T>(entry: CacheEntry<T> | null): entry is CacheEntry<T> {
  if (!entry) return false
  return Date.now() - entry.timestamp < CACHE_TTL_MS
}

/**
 * Fetch current USDC reserve metrics from Kamino API.
 * APY values are already decimal (0.021 = 2.1%).
 * Cached for 60 seconds.
 */
export async function fetchUsdcReserveMetrics(
  apiBaseUrl: string = DEFAULT_API_BASE
): Promise<KaminoReserveMetrics> {
  if (isCacheValid(metricsCache)) return metricsCache.value

  const url = `${apiBaseUrl}/kamino-market/${KAMINO_MAIN_MARKET}/reserves/metrics`
  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(`Kamino API error: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as RawReserveEntry[]
  const usdc = data.find((r) => r.liquidityToken === 'USDC')

  if (!usdc) {
    throw new Error('USDC reserve not found in Kamino response')
  }

  const totalSupplyUsd = Number(usdc.totalSupplyUsd)
  const totalBorrowUsd = Number(usdc.totalBorrowUsd)

  const metrics: KaminoReserveMetrics = {
    supplyApy: Number(usdc.supplyApy),
    borrowApy: Number(usdc.borrowApy),
    totalSupplyUsd,
    totalBorrowUsd,
    availableLiquidityUsd: totalSupplyUsd - totalBorrowUsd,
    utilization: totalSupplyUsd > 0 ? totalBorrowUsd / totalSupplyUsd : 0,
  }

  metricsCache = { value: metrics, timestamp: Date.now() }
  return metrics
}

/**
 * Fetch historical USDC lending metrics from Kamino API.
 * Returns daily data points since Oct 2023 (~21,000+ points).
 */
export async function fetchHistoricalMetrics(
  apiBaseUrl: string = DEFAULT_API_BASE
): Promise<KaminoHistoricalPoint[]> {
  const url = `${apiBaseUrl}/kamino-market/${KAMINO_MAIN_MARKET}/reserves/${KAMINO_USDC_RESERVE}/metrics/history`
  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(`Kamino API error: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as RawHistoryResponse

  return data.history.map((entry) => ({
    timestamp: new Date(entry.timestamp).getTime(),
    supplyApy: entry.metrics.supplyInterestAPY,
    borrowApy: entry.metrics.borrowInterestAPY,
    tvlUsd: Number(entry.metrics.depositTvl),
  }))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/local-dev/nanuqfi && pnpm --filter @nanuqfi/backend-kamino exec vitest run src/utils/kamino-api.test.ts`

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
cd ~/local-dev/nanuqfi
git add packages/backend-kamino/src/utils/kamino-api.ts packages/backend-kamino/src/utils/kamino-api.test.ts
git commit -m "feat(backend-kamino): add Kamino REST API client with 60s cache"
```

---

### Task 3: Implement KaminoLendingBackend

**Files:**
- Create: `packages/backend-kamino/src/backends/lending.ts`
- Create: `packages/backend-kamino/src/backends/lending.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/backend-kamino/src/backends/lending.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { KaminoLendingBackend } from './lending'
import { clearKaminoCache } from '../utils/kamino-api'

const MOCK_RESERVE_RESPONSE = [
  {
    reserve: 'D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59',
    liquidityToken: 'USDC',
    liquidityTokenMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    maxLtv: '0.8',
    borrowApy: '0.038',
    supplyApy: '0.021',
    totalSupply: '209000000',
    totalBorrow: '155000000',
    totalBorrowUsd: '155000000',
    totalSupplyUsd: '209000000',
  },
]

describe('KaminoLendingBackend — mock mode', () => {
  it('implements YieldBackend interface', () => {
    const backend = new KaminoLendingBackend()
    expect(backend.name).toBe('kamino-lending')
    expect(backend.capabilities.supportedAssets).toContain('USDC')
  })

  it('returns mock yield in mock mode', async () => {
    const backend = new KaminoLendingBackend()
    const estimate = await backend.getExpectedYield()
    expect(estimate.annualizedApy).toBe(0.045)
    expect(estimate.metadata?.mode).toBe('mock')
    expect(estimate.metadata?.protocol).toBe('kamino')
  })

  it('accepts custom APY override', async () => {
    const backend = new KaminoLendingBackend({ mockApy: 0.10 })
    const estimate = await backend.getExpectedYield()
    expect(estimate.annualizedApy).toBe(0.10)
  })

  it('returns low-risk metrics', async () => {
    const backend = new KaminoLendingBackend()
    const risk = await backend.getRisk()
    expect(risk.liquidationRisk).toBe('none')
    expect(risk.volatilityScore).toBeLessThan(0.1)
  })

  it('estimates near-zero slippage', async () => {
    const backend = new KaminoLendingBackend()
    const slippage = await backend.estimateSlippage(1_000_000n)
    expect(slippage).toBeLessThanOrEqual(5)
  })

  it('tracks deposit/withdraw state', async () => {
    const backend = new KaminoLendingBackend()

    const posBefore = await backend.getPosition()
    expect(posBefore.isActive).toBe(false)

    await backend.deposit(100_000_000n)
    const posAfter = await backend.getPosition()
    expect(posAfter.isActive).toBe(true)
    expect(posAfter.depositedAmount).toBe(100_000_000n)

    await backend.withdraw(100_000_000n)
    const posFinal = await backend.getPosition()
    expect(posFinal.isActive).toBe(false)
  })

  it('registers with YieldBackendRegistry', async () => {
    const { YieldBackendRegistry } = await import('@nanuqfi/core')
    const registry = new YieldBackendRegistry()
    const backend = new KaminoLendingBackend()
    registry.register(backend)
    expect(registry.get('kamino-lending')?.name).toBe('kamino-lending')
  })
})

describe('KaminoLendingBackend — real mode', () => {
  beforeEach(() => {
    clearKaminoCache()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches live APY from Kamino API', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_RESERVE_RESPONSE),
    } as Response)

    const backend = new KaminoLendingBackend({ mockMode: false })
    const estimate = await backend.getExpectedYield()

    expect(estimate.annualizedApy).toBe(0.021)
    expect(estimate.metadata?.mode).toBe('real')
  })

  it('computes risk from utilization', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_RESERVE_RESPONSE),
    } as Response)

    const backend = new KaminoLendingBackend({ mockMode: false })
    const risk = await backend.getRisk()

    // utilization = 155M/209M ≈ 0.7416
    // volatility = 0.02 + 0.7416 * 0.08 ≈ 0.0793
    expect(risk.volatilityScore).toBeCloseTo(0.0793, 2)
    expect(risk.metadata?.utilization).toBeCloseTo(0.7416, 3)
  })

  it('deposit returns allocator-cpi stub', async () => {
    const backend = new KaminoLendingBackend({ mockMode: false })
    const tx = await backend.deposit(100_000_000n)
    expect(tx).toContain('pending-allocator-cpi')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/local-dev/nanuqfi && pnpm --filter @nanuqfi/backend-kamino exec vitest run src/backends/lending.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement KaminoLendingBackend**

Create `packages/backend-kamino/src/backends/lending.ts`:

```typescript
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
 * Real mode: live rates from Kamino REST API (api.kamino.finance).
 *
 * deposit()/withdraw() are stubs — allocator program handles actual CPI.
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
    minDeposit: 1_000_000n,
    maxDeposit: 50_000_000_000n,
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
    const volatilityScore = 0.02 + metrics.utilization * 0.08

    return {
      volatilityScore,
      maxDrawdown: 0.003,
      liquidationRisk: 'none',
      correlationToMarket: 0.12,
      metadata: {
        mode: 'real',
        protocol: 'kamino',
        utilization: metrics.utilization,
      },
    }
  }

  async estimateSlippage(amount: bigint): Promise<number> {
    if (this.isMockMode) return 2

    const metrics = await fetchUsdcReserveMetrics(this.apiBaseUrl)
    const amountUsd = Number(amount) / 1e6
    const ratio = amountUsd / metrics.availableLiquidityUsd
    if (ratio > 0.1) return 10
    if (ratio > 0.01) return 5
    return 2
  }

  async deposit(amount: bigint, _params?: Record<string, unknown>): Promise<TxSignature> {
    this.deposited += amount
    this.active = true
    if (this.isMockMode) return `mock-tx-kamino-lending-deposit-${Date.now()}`
    return `pending-allocator-cpi-deposit-${Date.now()}`
  }

  async withdraw(amount: bigint): Promise<TxSignature> {
    this.deposited -= amount
    if (this.deposited <= 0n) {
      this.deposited = 0n
      this.active = false
    }
    if (this.isMockMode) return `mock-tx-kamino-lending-withdraw-${Date.now()}`
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
        protocol: 'kamino',
      },
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/local-dev/nanuqfi && pnpm --filter @nanuqfi/backend-kamino exec vitest run src/backends/lending.test.ts`

Expected: All 10 tests pass.

- [ ] **Step 5: Commit**

```bash
cd ~/local-dev/nanuqfi
git add packages/backend-kamino/src/backends/lending.ts packages/backend-kamino/src/backends/lending.test.ts
git commit -m "feat(backend-kamino): implement KaminoLendingBackend with mock/real mode"
```

---

### Task 4: Integration tests + exports + docs

**Files:**
- Create: `packages/backend-kamino/src/integration/mainnet.test.ts`
- Modify: `packages/backend-kamino/src/index.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Create integration tests**

Create `packages/backend-kamino/src/integration/mainnet.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { fetchUsdcReserveMetrics, fetchHistoricalMetrics, clearKaminoCache } from '../utils/kamino-api'
import { KaminoLendingBackend } from '../backends/lending'

const SKIP = !process.env.KAMINO_INTEGRATION

describe.skipIf(!SKIP)('Kamino mainnet integration', () => {
  it('fetches live USDC supply APY', async () => {
    clearKaminoCache()
    const metrics = await fetchUsdcReserveMetrics()

    expect(metrics.supplyApy).toBeGreaterThan(0.001)
    expect(metrics.supplyApy).toBeLessThan(0.30)
    expect(metrics.totalSupplyUsd).toBeGreaterThan(1_000_000)
    console.log(`Kamino USDC supply APY: ${(metrics.supplyApy * 100).toFixed(2)}%`)
    console.log(`TVL: $${(metrics.totalSupplyUsd / 1e6).toFixed(1)}M`)
  }, 15_000)

  it('fetches historical metrics', async () => {
    const points = await fetchHistoricalMetrics()

    expect(points.length).toBeGreaterThan(1000)
    expect(points[points.length - 1]!.supplyApy).toBeGreaterThan(0)
    console.log(`Historical data points: ${points.length}`)
    console.log(`Date range: ${new Date(points[0]!.timestamp).toISOString()} → ${new Date(points[points.length - 1]!.timestamp).toISOString()}`)
  }, 30_000)

  it('backend works end-to-end in real mode', async () => {
    clearKaminoCache()
    const backend = new KaminoLendingBackend({ mockMode: false })

    const estimate = await backend.getExpectedYield()
    expect(estimate.annualizedApy).toBeGreaterThan(0.001)
    expect(estimate.metadata?.mode).toBe('real')

    const risk = await backend.getRisk()
    expect(risk.volatilityScore).toBeGreaterThan(0)

    console.log(`Live APY: ${(estimate.annualizedApy * 100).toFixed(2)}%`)
    console.log(`Volatility: ${risk.volatilityScore.toFixed(4)}`)
  }, 15_000)
})
```

- [ ] **Step 2: Update index.ts with all exports**

Replace `packages/backend-kamino/src/index.ts`:

```typescript
export { KaminoLendingBackend, type KaminoLendingConfig } from './backends/lending'
export {
  fetchUsdcReserveMetrics,
  fetchHistoricalMetrics,
  clearKaminoCache,
  KAMINO_MAIN_MARKET,
  KAMINO_USDC_RESERVE,
  type KaminoReserveMetrics,
  type KaminoHistoricalPoint,
} from './utils/kamino-api'
```

- [ ] **Step 3: Run full test suite**

Run: `cd ~/local-dev/nanuqfi && pnpm --filter @nanuqfi/backend-kamino test`

Expected: All unit tests pass, integration tests skipped.

- [ ] **Step 4: Run integration tests against live API**

Run: `cd ~/local-dev/nanuqfi && KAMINO_INTEGRATION=1 pnpm --filter @nanuqfi/backend-kamino exec vitest run src/integration/mainnet.test.ts`

Expected: 3 tests pass with live data output.

- [ ] **Step 5: Build to verify TypeScript**

Run: `cd ~/local-dev/nanuqfi && pnpm --filter @nanuqfi/backend-kamino build`

- [ ] **Step 6: Run full monorepo test suite**

Run: `cd ~/local-dev/nanuqfi && pnpm turbo test`

Expected: All packages pass.

- [ ] **Step 7: Update CLAUDE.md**

In root `CLAUDE.md`:
- Add `@nanuqfi/backend-kamino` section after backend-marginfi
- Update total test count

- [ ] **Step 8: Commit**

```bash
cd ~/local-dev/nanuqfi
git add packages/backend-kamino/ CLAUDE.md
git commit -m "feat: add @nanuqfi/backend-kamino — zero-dep REST API backend with 21K historical points"
```
