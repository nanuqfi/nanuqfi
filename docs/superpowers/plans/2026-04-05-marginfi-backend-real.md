# Real Marginfi Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `@nanuqfi/backend-marginfi` from mock stub to real Marginfi SDK integration with mainnet rate reads, utilization-based risk metrics, and DeFi Llama historical data for backtesting.

**Architecture:** MarginfiClient on mainnet for live on-chain rate reads (`bank.computeInterestRates()`), DeFi Llama yield API for historical backtest data, mock mode for offline unit tests. Backend is a data + scoring layer — `deposit()`/`withdraw()` remain stubs until the allocator program gets Marginfi CPI (Phase 5).

**Tech Stack:** TypeScript, `@mrgnlabs/marginfi-client-v2@6.4.1`, `@mrgnlabs/mrgn-common@2.0.7`, `@solana/web3.js@^1.98.4`, `@coral-xyz/anchor@^0.30.1`, Vitest

**Spec:** `docs/superpowers/specs/2026-04-05-marginfi-backend-real-design.md`

---

### Task 1: Install Marginfi SDK dependencies

**Files:**
- Modify: `packages/backend-marginfi/package.json`

- [ ] **Step 1: Add dependencies to package.json**

Replace the current `dependencies` and `devDependencies` in `packages/backend-marginfi/package.json`:

```json
{
  "name": "@nanuqfi/backend-marginfi",
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
    "@coral-xyz/anchor": "^0.30.1",
    "@mrgnlabs/marginfi-client-v2": "6.4.1",
    "@mrgnlabs/mrgn-common": "2.0.7",
    "@nanuqfi/core": "workspace:*",
    "@solana/web3.js": "^1.98.4"
  },
  "devDependencies": {
    "typescript": "^5.7",
    "vitest": "^3"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd ~/local-dev/nanuqfi && pnpm install`

Expected: Clean install, no peer dep warnings for marginfi packages.

- [ ] **Step 3: Verify existing tests still pass**

Run: `cd ~/local-dev/nanuqfi && pnpm --filter @nanuqfi/backend-marginfi test`

Expected: 7 tests pass (backward compatibility).

- [ ] **Step 4: Commit**

```bash
cd ~/local-dev/nanuqfi
git add packages/backend-marginfi/package.json pnpm-lock.yaml
git commit -m "chore(backend-marginfi): add Marginfi SDK dependencies"
```

---

### Task 2: Create marginfi-connection factory

**Files:**
- Create: `packages/backend-marginfi/src/utils/marginfi-connection.ts`
- Create: `packages/backend-marginfi/src/utils/marginfi-connection.test.ts`

- [ ] **Step 1: Write failing tests for the connection factory**

Create `packages/backend-marginfi/src/utils/marginfi-connection.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createReadOnlyMarginfiClient, type MarginfiConnectionConfig } from './marginfi-connection'

describe('createReadOnlyMarginfiClient', () => {
  it('exports a factory function', () => {
    expect(typeof createReadOnlyMarginfiClient).toBe('function')
  })

  it('requires rpcUrl in config', () => {
    expect(() => createReadOnlyMarginfiClient({ rpcUrl: '' })).toThrow('rpcUrl is required')
  })

  it('returns a promise', () => {
    const config: MarginfiConnectionConfig = { rpcUrl: 'https://api.mainnet-beta.solana.com' }
    const result = createReadOnlyMarginfiClient(config)
    expect(result).toBeInstanceOf(Promise)
    // Don't await — this would make a real RPC call
    // Just verify it returns a promise
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/local-dev/nanuqfi && pnpm --filter @nanuqfi/backend-marginfi exec vitest run src/utils/marginfi-connection.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the connection factory**

Create `packages/backend-marginfi/src/utils/marginfi-connection.ts`:

```typescript
import { Connection, Keypair } from '@solana/web3.js'
import { MarginfiClient, getConfig } from '@mrgnlabs/marginfi-client-v2'
import { NodeWallet } from '@mrgnlabs/mrgn-common'

export interface MarginfiConnectionConfig {
  rpcUrl: string
  commitment?: 'confirmed' | 'finalized'
}

/**
 * Create a read-only MarginfiClient for fetching bank data from mainnet.
 * Uses a dummy wallet — no signing, no transactions.
 */
export async function createReadOnlyMarginfiClient(
  config: MarginfiConnectionConfig
): Promise<MarginfiClient> {
  if (!config.rpcUrl) {
    throw new Error('rpcUrl is required')
  }

  const commitment = config.commitment ?? 'confirmed'
  const connection = new Connection(config.rpcUrl, { commitment })
  const wallet = new NodeWallet(Keypair.generate())
  const marginfiConfig = getConfig('production')

  const client = await MarginfiClient.fetch(marginfiConfig, wallet, connection)
  return client
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/local-dev/nanuqfi && pnpm --filter @nanuqfi/backend-marginfi exec vitest run src/utils/marginfi-connection.test.ts`

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
cd ~/local-dev/nanuqfi
git add packages/backend-marginfi/src/utils/marginfi-connection.ts packages/backend-marginfi/src/utils/marginfi-connection.test.ts
git commit -m "feat(backend-marginfi): add read-only MarginfiClient connection factory"
```

---

### Task 3: Create marginfi-data-api — rate fetching with cache

**Files:**
- Create: `packages/backend-marginfi/src/utils/marginfi-data-api.ts`
- Create: `packages/backend-marginfi/src/utils/marginfi-data-api.test.ts`

- [ ] **Step 1: Write failing tests for fetchLendingRate**

Create `packages/backend-marginfi/src/utils/marginfi-data-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchLendingRate,
  fetchBankMetrics,
  clearRateCache,
  type MarginfiBank,
} from './marginfi-data-api'

// Minimal mock matching the Marginfi Bank interface methods we use
function createMockBank(overrides?: Partial<MarginfiBank>): MarginfiBank {
  return {
    tokenSymbol: 'USDC',
    mint: { toBase58: () => 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
    mintDecimals: 6,
    computeInterestRates: () => ({
      lendingRate: 0.065,
      borrowingRate: 0.085,
    }),
    computeUtilizationRate: () => 0.72,
    getTotalAssetQuantity: () => ({ toNumber: () => 50_000_000_000_000 }),
    getTotalLiabilityQuantity: () => ({ toNumber: () => 36_000_000_000_000 }),
    ...overrides,
  }
}

// Minimal mock matching MarginfiClient.getBankByTokenSymbol
function createMockClient(bank: MarginfiBank | null = createMockBank()) {
  return {
    getBankByTokenSymbol: vi.fn().mockReturnValue(bank),
  }
}

describe('fetchLendingRate', () => {
  beforeEach(() => {
    clearRateCache()
  })

  it('returns lending rate from bank', () => {
    const client = createMockClient()
    const rate = fetchLendingRate(client, 'USDC')
    expect(rate).toBe(0.065)
  })

  it('throws if bank not found', () => {
    const client = createMockClient(null)
    expect(() => fetchLendingRate(client, 'FAKE')).toThrow('Bank FAKE not found')
  })

  it('caches result for same token within TTL', () => {
    const client = createMockClient()
    fetchLendingRate(client, 'USDC')
    fetchLendingRate(client, 'USDC')
    expect(client.getBankByTokenSymbol).toHaveBeenCalledTimes(1)
  })

  it('re-fetches after cache expires', () => {
    vi.useFakeTimers()
    const client = createMockClient()

    fetchLendingRate(client, 'USDC')
    vi.advanceTimersByTime(61_000) // 61 seconds > 60s TTL
    fetchLendingRate(client, 'USDC')

    expect(client.getBankByTokenSymbol).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})

describe('fetchBankMetrics', () => {
  beforeEach(() => {
    clearRateCache()
  })

  it('returns utilization, assets, liabilities, tvl', () => {
    const client = createMockClient()
    const metrics = fetchBankMetrics(client, 'USDC')

    expect(metrics.utilization).toBe(0.72)
    expect(metrics.totalAssets).toBe(50_000_000_000_000)
    expect(metrics.totalLiabilities).toBe(36_000_000_000_000)
    expect(metrics.availableLiquidity).toBe(14_000_000_000_000)
  })

  it('throws if bank not found', () => {
    const client = createMockClient(null)
    expect(() => fetchBankMetrics(client, 'FAKE')).toThrow('Bank FAKE not found')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/local-dev/nanuqfi && pnpm --filter @nanuqfi/backend-marginfi exec vitest run src/utils/marginfi-data-api.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement marginfi-data-api**

Create `packages/backend-marginfi/src/utils/marginfi-data-api.ts`:

```typescript
/**
 * Marginfi data API — rate fetching with in-memory cache.
 *
 * Uses MarginfiClient's bank objects for on-chain reads.
 * The MarginfiBank/MarginfiClientLike types are minimal interfaces
 * so unit tests can provide lightweight mocks without importing the full SDK.
 */

export interface MarginfiBank {
  tokenSymbol: string
  mint: { toBase58(): string }
  mintDecimals: number
  computeInterestRates(): { lendingRate: number; borrowingRate: number }
  computeUtilizationRate(): number
  getTotalAssetQuantity(): { toNumber(): number }
  getTotalLiabilityQuantity(): { toNumber(): number }
}

export interface MarginfiClientLike {
  getBankByTokenSymbol(symbol: string): MarginfiBank | null
}

export interface BankMetrics {
  utilization: number
  totalAssets: number
  totalLiabilities: number
  availableLiquidity: number
}

const CACHE_TTL_MS = 60_000 // 60 seconds

interface CacheEntry<T> {
  value: T
  timestamp: number
}

const rateCache = new Map<string, CacheEntry<number>>()
const metricsCache = new Map<string, CacheEntry<BankMetrics>>()

export function clearRateCache(): void {
  rateCache.clear()
  metricsCache.clear()
}

function isCacheValid<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  if (!entry) return false
  return Date.now() - entry.timestamp < CACHE_TTL_MS
}

function requireBank(client: MarginfiClientLike, tokenSymbol: string): MarginfiBank {
  const bank = client.getBankByTokenSymbol(tokenSymbol)
  if (!bank) {
    throw new Error(`Bank ${tokenSymbol} not found on Marginfi`)
  }
  return bank
}

/**
 * Fetch current USDC lending rate from Marginfi bank.
 * Returns APY as a decimal (e.g. 0.065 = 6.5%).
 * Results are cached for 60 seconds.
 */
export function fetchLendingRate(client: MarginfiClientLike, tokenSymbol: string): number {
  const cacheKey = `rate:${tokenSymbol}`
  const cached = rateCache.get(cacheKey)
  if (isCacheValid(cached)) return cached.value

  const bank = requireBank(client, tokenSymbol)
  const rates = bank.computeInterestRates()
  const rate = rates.lendingRate

  rateCache.set(cacheKey, { value: rate, timestamp: Date.now() })
  return rate
}

/**
 * Fetch bank metrics: utilization, total assets/liabilities, available liquidity.
 * Results are cached for 60 seconds.
 */
export function fetchBankMetrics(client: MarginfiClientLike, tokenSymbol: string): BankMetrics {
  const cacheKey = `metrics:${tokenSymbol}`
  const cached = metricsCache.get(cacheKey)
  if (isCacheValid(cached)) return cached.value

  const bank = requireBank(client, tokenSymbol)
  const totalAssets = bank.getTotalAssetQuantity().toNumber()
  const totalLiabilities = bank.getTotalLiabilityQuantity().toNumber()

  const metrics: BankMetrics = {
    utilization: bank.computeUtilizationRate(),
    totalAssets,
    totalLiabilities,
    availableLiquidity: totalAssets - totalLiabilities,
  }

  metricsCache.set(cacheKey, { value: metrics, timestamp: Date.now() })
  return metrics
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/local-dev/nanuqfi && pnpm --filter @nanuqfi/backend-marginfi exec vitest run src/utils/marginfi-data-api.test.ts`

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
cd ~/local-dev/nanuqfi
git add packages/backend-marginfi/src/utils/marginfi-data-api.ts packages/backend-marginfi/src/utils/marginfi-data-api.test.ts
git commit -m "feat(backend-marginfi): add rate fetching with 60s cache"
```

---

### Task 4: Create DeFi Llama historical data utility

**Files:**
- Create: `packages/backend-marginfi/src/utils/defillama-api.ts`
- Create: `packages/backend-marginfi/src/utils/defillama-api.test.ts`

- [ ] **Step 1: Write failing tests for fetchHistoricalRates**

Create `packages/backend-marginfi/src/utils/defillama-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fetchHistoricalRates,
  parseHistoricalResponse,
  type HistoricalRatePoint,
} from './defillama-api'

describe('parseHistoricalResponse', () => {
  it('parses DeFi Llama chart response into rate points', () => {
    const raw = {
      status: 'success',
      data: [
        { timestamp: '2026-01-01T00:00:00.000Z', tvlUsd: 50000000, apy: 6.5, apyBase: 6.5, apyReward: null },
        { timestamp: '2026-01-02T00:00:00.000Z', tvlUsd: 51000000, apy: 7.1, apyBase: 7.1, apyReward: null },
      ],
    }

    const points = parseHistoricalResponse(raw)
    expect(points).toHaveLength(2)
    expect(points[0]).toEqual({
      timestamp: new Date('2026-01-01T00:00:00.000Z').getTime(),
      apy: 0.065,
      tvlUsd: 50000000,
    })
    expect(points[1]).toEqual({
      timestamp: new Date('2026-01-02T00:00:00.000Z').getTime(),
      apy: 0.071,
      tvlUsd: 51000000,
    })
  })

  it('filters out entries with null/zero APY', () => {
    const raw = {
      status: 'success',
      data: [
        { timestamp: '2026-01-01T00:00:00.000Z', tvlUsd: 50000000, apy: 0, apyBase: 0, apyReward: null },
        { timestamp: '2026-01-02T00:00:00.000Z', tvlUsd: 51000000, apy: 6.5, apyBase: 6.5, apyReward: null },
      ],
    }

    const points = parseHistoricalResponse(raw)
    expect(points).toHaveLength(1)
    expect(points[0]!.apy).toBe(0.065)
  })

  it('returns empty array for empty response', () => {
    const raw = { status: 'success', data: [] }
    const points = parseHistoricalResponse(raw)
    expect(points).toHaveLength(0)
  })
})

describe('fetchHistoricalRates', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls DeFi Llama chart endpoint with pool ID', async () => {
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({
        status: 'success',
        data: [
          { timestamp: '2026-01-01T00:00:00.000Z', tvlUsd: 50000000, apy: 6.5, apyBase: 6.5, apyReward: null },
        ],
      }),
    }
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response)

    const points = await fetchHistoricalRates('test-pool-id')

    expect(fetch).toHaveBeenCalledWith('https://yields.llama.fi/chart/test-pool-id')
    expect(points).toHaveLength(1)
    expect(points[0]!.apy).toBe(0.065)
  })

  it('throws on non-OK response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response)

    await expect(fetchHistoricalRates('bad-id')).rejects.toThrow('DeFi Llama API error: 404 Not Found')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/local-dev/nanuqfi && pnpm --filter @nanuqfi/backend-marginfi exec vitest run src/utils/defillama-api.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement DeFi Llama API utility**

Create `packages/backend-marginfi/src/utils/defillama-api.ts`:

```typescript
/**
 * DeFi Llama yield API client for historical rate data.
 *
 * Used for backtesting — pulls historical APY timeseries for any pool.
 * Works for any protocol listed in DeFi Llama yields (Kamino, Jupiter, Save, etc.).
 *
 * Note: Marginfi lending pools are NOT listed in DeFi Llama yields API.
 * For Marginfi backtest, use comparable protocol data or the rate snapshotter.
 *
 * Known pool IDs:
 * - Kamino USDC lending: d2141a59-c199-4be7-8d4b-c8223954836b
 * - Jupiter USDC lending: d783c8df-e2ed-44b4-8317-161ccc1b5f06
 */

const DEFILLAMA_YIELDS_BASE = 'https://yields.llama.fi'

export interface HistoricalRatePoint {
  timestamp: number    // epoch ms
  apy: number          // decimal (0.065 = 6.5%)
  tvlUsd: number
}

interface RawChartEntry {
  timestamp: string
  tvlUsd: number
  apy: number | null
  apyBase: number | null
  apyReward: number | null
}

interface ChartResponse {
  status: string
  data: RawChartEntry[]
}

/**
 * Parse DeFi Llama chart response into typed rate points.
 * Converts percentage APY (6.5) to decimal (0.065).
 * Filters out entries with null/zero APY.
 */
export function parseHistoricalResponse(raw: ChartResponse): HistoricalRatePoint[] {
  return raw.data
    .filter((entry) => entry.apy != null && entry.apy > 0)
    .map((entry) => ({
      timestamp: new Date(entry.timestamp).getTime(),
      apy: entry.apy! / 100,
      tvlUsd: entry.tvlUsd,
    }))
}

/**
 * Fetch historical APY timeseries from DeFi Llama for a given pool.
 * Returns daily data points going back to pool creation.
 */
export async function fetchHistoricalRates(poolId: string): Promise<HistoricalRatePoint[]> {
  const url = `${DEFILLAMA_YIELDS_BASE}/chart/${poolId}`
  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(`DeFi Llama API error: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as ChartResponse
  return parseHistoricalResponse(data)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/local-dev/nanuqfi && pnpm --filter @nanuqfi/backend-marginfi exec vitest run src/utils/defillama-api.test.ts`

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
cd ~/local-dev/nanuqfi
git add packages/backend-marginfi/src/utils/defillama-api.ts packages/backend-marginfi/src/utils/defillama-api.test.ts
git commit -m "feat(backend-marginfi): add DeFi Llama historical rate API for backtesting"
```

---

### Task 5: Refactor lending backend — add mock/real mode config

**Files:**
- Modify: `packages/backend-marginfi/src/backends/lending.ts`
- Modify: `packages/backend-marginfi/src/backends/lending.test.ts`

This task refactors the existing stub to support both mock and real mode. All existing tests must continue to pass (mock mode is the default).

- [ ] **Step 1: Write failing tests for new mock/real mode behavior**

Add these tests to the END of the existing `lending.test.ts` (do NOT delete existing tests):

```typescript
import { describe, it, expect, vi } from 'vitest'
import { MarginfiLendingBackend } from './lending'

// ... existing tests stay exactly as they are ...

describe('MarginfiLendingBackend — mock/real mode', () => {
  it('defaults to mock mode when no client provided', async () => {
    const backend = new MarginfiLendingBackend()
    const estimate = await backend.getExpectedYield()
    expect(estimate.metadata?.mode).toBe('mock')
  })

  it('defaults to mock mode when mockMode is explicitly true', async () => {
    const backend = new MarginfiLendingBackend({ mockMode: true })
    const estimate = await backend.getExpectedYield()
    expect(estimate.metadata?.mode).toBe('mock')
  })

  it('throws if real mode requested without client', () => {
    expect(() => new MarginfiLendingBackend({ mockMode: false }))
      .toThrow('MarginfiClient required for real mode')
  })

  it('accepts marginfiClient for real mode', () => {
    const mockClient = {
      getBankByTokenSymbol: vi.fn().mockReturnValue({
        computeInterestRates: () => ({ lendingRate: 0.07, borrowingRate: 0.09 }),
        computeUtilizationRate: () => 0.65,
        getTotalAssetQuantity: () => ({ toNumber: () => 50_000_000_000_000 }),
        getTotalLiabilityQuantity: () => ({ toNumber: () => 32_500_000_000_000 }),
      }),
    }
    const backend = new MarginfiLendingBackend({
      mockMode: false,
      marginfiClient: mockClient,
    })
    expect(backend.name).toBe('marginfi-lending')
  })
})
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `cd ~/local-dev/nanuqfi && pnpm --filter @nanuqfi/backend-marginfi exec vitest run src/backends/lending.test.ts`

Expected: New tests fail (mockMode/marginfiClient not in config), old tests still pass.

- [ ] **Step 3: Refactor MarginfiLendingConfig and constructor**

Replace the full contents of `packages/backend-marginfi/src/backends/lending.ts`:

```typescript
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
```

- [ ] **Step 4: Run ALL tests to verify backward compatibility + new tests pass**

Run: `cd ~/local-dev/nanuqfi && pnpm --filter @nanuqfi/backend-marginfi exec vitest run src/backends/lending.test.ts`

Expected: All 11 tests pass (7 existing + 4 new).

- [ ] **Step 5: Commit**

```bash
cd ~/local-dev/nanuqfi
git add packages/backend-marginfi/src/backends/lending.ts packages/backend-marginfi/src/backends/lending.test.ts
git commit -m "feat(backend-marginfi): refactor lending backend with mock/real mode"
```

---

### Task 6: Add real-mode yield and risk tests

**Files:**
- Modify: `packages/backend-marginfi/src/backends/lending.test.ts`

- [ ] **Step 1: Write tests for real-mode getExpectedYield and getRisk**

Add these tests to the END of `lending.test.ts`:

```typescript
describe('MarginfiLendingBackend — real mode behavior', () => {
  function createMockClient(lendingRate = 0.07, utilization = 0.65) {
    return {
      getBankByTokenSymbol: vi.fn().mockReturnValue({
        computeInterestRates: () => ({ lendingRate, borrowingRate: 0.09 }),
        computeUtilizationRate: () => utilization,
        getTotalAssetQuantity: () => ({ toNumber: () => 50_000_000_000_000 }),
        getTotalLiabilityQuantity: () => ({ toNumber: () => 32_500_000_000_000 }),
      }),
    }
  }

  it('getExpectedYield returns live rate from bank', async () => {
    const client = createMockClient(0.082)
    const backend = new MarginfiLendingBackend({ mockMode: false, marginfiClient: client })

    const estimate = await backend.getExpectedYield()
    expect(estimate.annualizedApy).toBe(0.082)
    expect(estimate.metadata?.mode).toBe('real')
    expect(estimate.confidence).toBe(0.92)
  })

  it('getRisk computes volatility from utilization', async () => {
    const client = createMockClient(0.07, 0.80)
    const backend = new MarginfiLendingBackend({ mockMode: false, marginfiClient: client })

    const risk = await backend.getRisk()
    // volatilityScore = 0.02 + 0.80 * 0.08 = 0.084
    expect(risk.volatilityScore).toBeCloseTo(0.084, 3)
    expect(risk.metadata?.utilization).toBe(0.80)
    expect(risk.liquidationRisk).toBe('none')
  })

  it('estimateSlippage scales with withdrawal size vs liquidity', async () => {
    const client = createMockClient()
    const backend = new MarginfiLendingBackend({ mockMode: false, marginfiClient: client })

    // Small withdrawal: 2 bps
    const small = await backend.estimateSlippage(100_000_000n) // 100 USDC
    expect(small).toBe(2)

    // Large withdrawal relative to liquidity: 10 bps
    const large = await backend.estimateSlippage(5_000_000_000_000n) // ~28% of available
    expect(large).toBe(10)
  })

  it('deposit returns allocator-cpi stub in real mode', async () => {
    const client = createMockClient()
    const backend = new MarginfiLendingBackend({ mockMode: false, marginfiClient: client })

    const tx = await backend.deposit(100_000_000n)
    expect(tx).toContain('pending-allocator-cpi')
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd ~/local-dev/nanuqfi && pnpm --filter @nanuqfi/backend-marginfi exec vitest run src/backends/lending.test.ts`

Expected: All 15 tests pass (11 previous + 4 new).

- [ ] **Step 3: Commit**

```bash
cd ~/local-dev/nanuqfi
git add packages/backend-marginfi/src/backends/lending.test.ts
git commit -m "test(backend-marginfi): add real-mode yield, risk, and slippage tests"
```

---

### Task 7: Update exports and run full test suite

**Files:**
- Modify: `packages/backend-marginfi/src/index.ts`

- [ ] **Step 1: Update index.ts with all exports**

Replace `packages/backend-marginfi/src/index.ts`:

```typescript
export { MarginfiLendingBackend, type MarginfiLendingConfig } from './backends/lending'
export { createReadOnlyMarginfiClient, type MarginfiConnectionConfig } from './utils/marginfi-connection'
export {
  fetchLendingRate,
  fetchBankMetrics,
  clearRateCache,
  type MarginfiBank,
  type MarginfiClientLike,
  type BankMetrics,
} from './utils/marginfi-data-api'
export {
  fetchHistoricalRates,
  parseHistoricalResponse,
  type HistoricalRatePoint,
} from './utils/defillama-api'
```

- [ ] **Step 2: Run full backend-marginfi test suite**

Run: `cd ~/local-dev/nanuqfi && pnpm --filter @nanuqfi/backend-marginfi test`

Expected: All tests pass (~18 total across 4 test files).

- [ ] **Step 3: Run full monorepo test suite**

Run: `cd ~/local-dev/nanuqfi && pnpm turbo test`

Expected: All packages pass (core: 28, backend-drift: 141, backend-marginfi: ~18).

- [ ] **Step 4: Build to verify TypeScript compilation**

Run: `cd ~/local-dev/nanuqfi && pnpm --filter @nanuqfi/backend-marginfi build`

Expected: Clean build, no type errors.

- [ ] **Step 5: Commit**

```bash
cd ~/local-dev/nanuqfi
git add packages/backend-marginfi/src/index.ts
git commit -m "feat(backend-marginfi): export all utilities — connection, data API, DeFi Llama"
```

---

### Task 8: Integration test with mainnet RPC

**Files:**
- Create: `packages/backend-marginfi/src/integration/mainnet.test.ts`

This test file is guarded — it only runs when `SOLANA_RPC_URL` is set.

- [ ] **Step 1: Write guarded integration tests**

Create `packages/backend-marginfi/src/integration/mainnet.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createReadOnlyMarginfiClient } from '../utils/marginfi-connection'
import { fetchLendingRate, fetchBankMetrics, clearRateCache } from '../utils/marginfi-data-api'

const RPC_URL = process.env.SOLANA_RPC_URL

describe.skipIf(!RPC_URL)('Marginfi mainnet integration', () => {
  it('connects to mainnet and fetches USDC lending rate', async () => {
    const client = await createReadOnlyMarginfiClient({ rpcUrl: RPC_URL! })
    clearRateCache()

    const rate = fetchLendingRate(client, 'USDC')

    // Mainnet USDC lending rate should be between 0.1% and 30%
    expect(rate).toBeGreaterThan(0.001)
    expect(rate).toBeLessThan(0.30)
    console.log(`Live Marginfi USDC lending rate: ${(rate * 100).toFixed(2)}%`)
  }, 30_000)

  it('fetches USDC bank metrics with non-zero TVL', async () => {
    const client = await createReadOnlyMarginfiClient({ rpcUrl: RPC_URL! })
    clearRateCache()

    const metrics = fetchBankMetrics(client, 'USDC')

    expect(metrics.utilization).toBeGreaterThan(0)
    expect(metrics.utilization).toBeLessThan(1)
    expect(metrics.totalAssets).toBeGreaterThan(0)
    expect(metrics.availableLiquidity).toBeGreaterThan(0)
    console.log(`Marginfi USDC utilization: ${(metrics.utilization * 100).toFixed(1)}%`)
    console.log(`Available liquidity: $${(metrics.availableLiquidity / 1e6).toFixed(0)}`)
  }, 30_000)

  it('creates backend in real mode with live client', async () => {
    const { MarginfiLendingBackend } = await import('../backends/lending')
    const client = await createReadOnlyMarginfiClient({ rpcUrl: RPC_URL! })

    const backend = new MarginfiLendingBackend({
      mockMode: false,
      marginfiClient: client,
    })

    const estimate = await backend.getExpectedYield()
    expect(estimate.annualizedApy).toBeGreaterThan(0.001)
    expect(estimate.metadata?.mode).toBe('real')

    const risk = await backend.getRisk()
    expect(risk.volatilityScore).toBeGreaterThan(0)
    expect(risk.liquidationRisk).toBe('none')

    console.log(`Live APY: ${(estimate.annualizedApy * 100).toFixed(2)}%`)
    console.log(`Volatility score: ${risk.volatilityScore.toFixed(4)}`)
  }, 30_000)
})
```

- [ ] **Step 2: Verify tests are skipped without RPC**

Run: `cd ~/local-dev/nanuqfi && pnpm --filter @nanuqfi/backend-marginfi test`

Expected: Integration tests show as skipped, all other tests pass.

- [ ] **Step 3: Run integration tests with mainnet RPC**

Run: `cd ~/local-dev/nanuqfi && SOLANA_RPC_URL=https://api.mainnet-beta.solana.com pnpm --filter @nanuqfi/backend-marginfi exec vitest run src/integration/mainnet.test.ts`

Expected: 3 tests pass with live rate output. If public RPC is rate-limited, use Helius RPC.

- [ ] **Step 4: Commit**

```bash
cd ~/local-dev/nanuqfi
git add packages/backend-marginfi/src/integration/mainnet.test.ts
git commit -m "test(backend-marginfi): add mainnet integration tests (guarded by SOLANA_RPC_URL)"
```

---

### Task 9: Verify and update documentation

**Files:**
- Modify: `CLAUDE.md` (root) — update test counts and backend-marginfi description

- [ ] **Step 1: Run full test suite and capture counts**

Run: `cd ~/local-dev/nanuqfi && pnpm turbo test 2>&1 | tail -20`

Expected: All tests pass. Note the new backend-marginfi test count.

- [ ] **Step 2: Update CLAUDE.md test count**

In the root `CLAUDE.md`, update the test count line from `7 backend-marginfi` to the new count (expected ~18). Update the `@nanuqfi/backend-marginfi` description from "Mock stub proving architecture" to "Real Marginfi SDK integration with mainnet rate reads".

- [ ] **Step 3: Final commit**

```bash
cd ~/local-dev/nanuqfi
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md — real Marginfi backend, updated test counts"
```
