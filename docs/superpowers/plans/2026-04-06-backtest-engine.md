# Backtest Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@nanuqfi/backtest` — a historical yield simulation engine that proves the routing algorithm outperforms single-protocol strategies across 2.5 years of data.

**Architecture:** Pure computation package with three layers: data loader (Kamino API + proxy estimates), simulation engine (day-by-day scoring + weight proposal), and metrics calculator (Sharpe, Sortino, drawdown, CAGR). Keeper serves results via `/v1/backtest` with 1-hour cache.

**Tech Stack:** TypeScript, Vitest, native `fetch()`

**Spec:** `docs/superpowers/specs/2026-04-06-backtest-engine-design.md`

---

### Task 1: Scaffold package + types

**Files:**
- Create: `packages/backtest/package.json`
- Create: `packages/backtest/tsconfig.json`
- Create: `packages/backtest/src/types.ts`
- Create: `packages/backtest/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@nanuqfi/backtest",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
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

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 3: Create types.ts**

```typescript
export interface BacktestConfig {
  riskFreeRate: number        // e.g. 0.04 = 4%
  marginfiApyMultiplier: number  // e.g. 1.08 — Marginfi historically ~8% above Kamino
  luloApyMultiplier: number      // e.g. 1.05 — Lulo aggregator premium above max
  initialDeposit: number         // e.g. 10000 (USD)
}

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  riskFreeRate: 0.04,
  marginfiApyMultiplier: 1.08,
  luloApyMultiplier: 1.05,
  initialDeposit: 10000,
}

export interface HistoricalDataPoint {
  timestamp: number          // epoch ms
  kaminoApy: number          // decimal (0.02 = 2%)
  marginfiApy: number        // estimated from Kamino
  luloApy: number            // estimated from max
}

export interface BacktestDataPoint {
  timestamp: number
  portfolioValue: number     // NanuqFi router
  kaminoValue: number        // Kamino-only baseline
  marginfiValue: number      // Marginfi-only baseline
  luloValue: number          // Lulo-only baseline
}

export interface ProtocolMetrics {
  totalReturn: number
  cagr: number
  maxDrawdown: number
  sharpeRatio: number
}

export interface BacktestResult {
  totalReturn: number
  cagr: number
  maxDrawdown: number
  sharpeRatio: number
  sortinoRatio: number
  volatility: number
  protocols: Record<string, ProtocolMetrics>
  series: BacktestDataPoint[]
  startDate: string
  endDate: string
  dataPoints: number
  riskFreeRate: number
}
```

- [ ] **Step 4: Create placeholder index.ts**

```typescript
export type {
  BacktestConfig,
  BacktestResult,
  BacktestDataPoint,
  HistoricalDataPoint,
  ProtocolMetrics,
} from './types'
export { DEFAULT_BACKTEST_CONFIG } from './types'
```

- [ ] **Step 5: Install and commit**

```bash
cd ~/local-dev/nanuqfi && pnpm install
git add packages/backtest/
git commit -m "chore(backtest): scaffold package with types"
```

---

### Task 2: Metrics calculator (TDD)

**Files:**
- Create: `packages/backtest/src/metrics.ts`
- Create: `packages/backtest/src/metrics.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest'
import { computeCagr, computeMaxDrawdown, computeSharpeRatio, computeSortinoRatio, computeVolatility } from './metrics'

describe('computeCagr', () => {
  it('computes compound annual growth rate', () => {
    // $10,000 → $11,000 over 1 year = 10%
    expect(computeCagr(10000, 11000, 365)).toBeCloseTo(0.10, 2)
  })

  it('computes CAGR over 2 years', () => {
    // $10,000 → $12,100 over 2 years = 10% CAGR
    expect(computeCagr(10000, 12100, 730)).toBeCloseTo(0.10, 2)
  })

  it('returns 0 for zero days', () => {
    expect(computeCagr(10000, 10000, 0)).toBe(0)
  })
})

describe('computeMaxDrawdown', () => {
  it('finds worst peak-to-trough decline', () => {
    const values = [100, 110, 105, 95, 100, 108]
    // Peak 110, trough 95 → drawdown = (110 - 95) / 110 = 0.1364
    expect(computeMaxDrawdown(values)).toBeCloseTo(0.1364, 3)
  })

  it('returns 0 for monotonically increasing series', () => {
    expect(computeMaxDrawdown([100, 101, 102, 103])).toBe(0)
  })

  it('returns 0 for empty series', () => {
    expect(computeMaxDrawdown([])).toBe(0)
  })
})

describe('computeVolatility', () => {
  it('computes annualized volatility from daily returns', () => {
    // Constant daily return → zero volatility
    const returns = Array(30).fill(0.001)
    expect(computeVolatility(returns)).toBeCloseTo(0, 5)
  })

  it('returns 0 for empty returns', () => {
    expect(computeVolatility([])).toBe(0)
  })
})

describe('computeSharpeRatio', () => {
  it('computes risk-adjusted return', () => {
    // 10% return, 4% risk-free, 12% volatility → Sharpe = (0.10 - 0.04) / 0.12 = 0.5
    expect(computeSharpeRatio(0.10, 0.04, 0.12)).toBeCloseTo(0.5, 2)
  })

  it('returns 0 for zero volatility', () => {
    expect(computeSharpeRatio(0.10, 0.04, 0)).toBe(0)
  })
})

describe('computeSortinoRatio', () => {
  it('uses only downside deviation', () => {
    // Mix of positive and negative daily returns
    const returns = [0.01, -0.005, 0.008, -0.003, 0.012, -0.001]
    const result = computeSortinoRatio(returns, 0.04)
    expect(result).toBeGreaterThan(0)
  })

  it('returns 0 for empty returns', () => {
    expect(computeSortinoRatio([], 0.04)).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd ~/local-dev/nanuqfi && pnpm --filter @nanuqfi/backtest exec vitest run src/metrics.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement metrics**

```typescript
const DAYS_PER_YEAR = 365
const SQRT_DAYS_PER_YEAR = Math.sqrt(DAYS_PER_YEAR)

/**
 * Compound Annual Growth Rate.
 * CAGR = (endValue / startValue)^(365/days) - 1
 */
export function computeCagr(startValue: number, endValue: number, days: number): number {
  if (days <= 0 || startValue <= 0) return 0
  return Math.pow(endValue / startValue, DAYS_PER_YEAR / days) - 1
}

/**
 * Maximum drawdown — worst peak-to-trough decline as a fraction.
 */
export function computeMaxDrawdown(values: number[]): number {
  if (values.length < 2) return 0
  let peak = values[0]!
  let maxDd = 0
  for (const v of values) {
    if (v > peak) peak = v
    const dd = (peak - v) / peak
    if (dd > maxDd) maxDd = dd
  }
  return maxDd
}

/**
 * Annualized volatility from daily returns.
 * vol = stddev(dailyReturns) * sqrt(365)
 */
export function computeVolatility(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
  const variance = dailyReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (dailyReturns.length - 1)
  return Math.sqrt(variance) * SQRT_DAYS_PER_YEAR
}

/**
 * Sharpe ratio = (annualizedReturn - riskFreeRate) / volatility
 */
export function computeSharpeRatio(annualizedReturn: number, riskFreeRate: number, volatility: number): number {
  if (volatility === 0) return 0
  return (annualizedReturn - riskFreeRate) / volatility
}

/**
 * Sortino ratio — like Sharpe but uses only downside deviation.
 */
export function computeSortinoRatio(dailyReturns: number[], riskFreeRate: number): number {
  if (dailyReturns.length < 2) return 0
  const dailyRf = riskFreeRate / DAYS_PER_YEAR
  const excessReturns = dailyReturns.map(r => r - dailyRf)
  const downsideReturns = excessReturns.filter(r => r < 0)
  if (downsideReturns.length === 0) return 0
  const downsideVariance = downsideReturns.reduce((sum, r) => sum + r ** 2, 0) / downsideReturns.length
  const downsideDev = Math.sqrt(downsideVariance) * SQRT_DAYS_PER_YEAR
  if (downsideDev === 0) return 0
  const annualizedReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length * DAYS_PER_YEAR
  return (annualizedReturn - riskFreeRate) / downsideDev
}
```

- [ ] **Step 4: Run tests**

Run: `cd ~/local-dev/nanuqfi && pnpm --filter @nanuqfi/backtest exec vitest run src/metrics.test.ts`

Expected: All 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/backtest/src/metrics.ts packages/backtest/src/metrics.test.ts
git commit -m "feat(backtest): add metrics calculator — CAGR, Sharpe, Sortino, drawdown"
```

---

### Task 3: Data loader (TDD)

**Files:**
- Create: `packages/backtest/src/data-loader.ts`
- Create: `packages/backtest/src/data-loader.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchHistoricalData } from './data-loader'
import type { BacktestConfig } from './types'
import { DEFAULT_BACKTEST_CONFIG } from './types'

const MOCK_KAMINO_RESPONSE = {
  reserve: 'D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59',
  history: [
    { timestamp: '2024-01-01T00:00:00.000Z', metrics: { supplyInterestAPY: 0.05, borrowInterestAPY: 0.08, depositTvl: '50000000' } },
    { timestamp: '2024-01-02T00:00:00.000Z', metrics: { supplyInterestAPY: 0.06, borrowInterestAPY: 0.09, depositTvl: '51000000' } },
    { timestamp: '2024-01-03T00:00:00.000Z', metrics: { supplyInterestAPY: 0.04, borrowInterestAPY: 0.07, depositTvl: '49000000' } },
  ],
}

describe('fetchHistoricalData', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('fetches Kamino history and generates protocol estimates', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_KAMINO_RESPONSE),
    } as Response)

    const data = await fetchHistoricalData(DEFAULT_BACKTEST_CONFIG)

    expect(data).toHaveLength(3)
    expect(data[0]!.kaminoApy).toBe(0.05)
    // Marginfi = kamino * 1.08
    expect(data[0]!.marginfiApy).toBeCloseTo(0.054, 3)
    // Lulo = max(kamino, marginfi) * 1.05
    expect(data[0]!.luloApy).toBeCloseTo(0.0567, 3)
  })

  it('filters out zero-APY entries', async () => {
    const responseWithZero = {
      ...MOCK_KAMINO_RESPONSE,
      history: [
        ...MOCK_KAMINO_RESPONSE.history,
        { timestamp: '2024-01-04T00:00:00.000Z', metrics: { supplyInterestAPY: 0, borrowInterestAPY: 0, depositTvl: '0' } },
      ],
    }
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(responseWithZero),
    } as Response)

    const data = await fetchHistoricalData(DEFAULT_BACKTEST_CONFIG)
    expect(data).toHaveLength(3)
  })

  it('throws on API error', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500, statusText: 'Error' } as Response)
    await expect(fetchHistoricalData(DEFAULT_BACKTEST_CONFIG)).rejects.toThrow('Kamino API error')
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd ~/local-dev/nanuqfi && pnpm --filter @nanuqfi/backtest exec vitest run src/data-loader.test.ts`

- [ ] **Step 3: Implement data loader**

```typescript
import type { HistoricalDataPoint, BacktestConfig } from './types'

const KAMINO_MAIN_MARKET = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF'
const KAMINO_USDC_RESERVE = 'D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59'

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

/**
 * Fetch Kamino historical data and generate estimated Marginfi/Lulo APYs.
 *
 * Marginfi estimate: kamino_apy * marginfiApyMultiplier (historically ~8% higher)
 * Lulo estimate: max(kamino, marginfi) * luloApyMultiplier (aggregator premium)
 */
export async function fetchHistoricalData(
  config: BacktestConfig,
  apiBaseUrl: string = 'https://api.kamino.finance'
): Promise<HistoricalDataPoint[]> {
  const url = `${apiBaseUrl}/kamino-market/${KAMINO_MAIN_MARKET}/reserves/${KAMINO_USDC_RESERVE}/metrics/history`
  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(`Kamino API error: ${res.status} ${res.statusText}`)
  }

  const raw = (await res.json()) as RawHistoryResponse

  return raw.history
    .filter((entry) => entry.metrics.supplyInterestAPY > 0)
    .map((entry) => {
      const kaminoApy = entry.metrics.supplyInterestAPY
      const marginfiApy = kaminoApy * config.marginfiApyMultiplier
      const luloApy = Math.max(kaminoApy, marginfiApy) * config.luloApyMultiplier

      return {
        timestamp: new Date(entry.timestamp).getTime(),
        kaminoApy,
        marginfiApy,
        luloApy,
      }
    })
}
```

- [ ] **Step 4: Run tests**

Run: `cd ~/local-dev/nanuqfi && pnpm --filter @nanuqfi/backtest exec vitest run src/data-loader.test.ts`

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/backtest/src/data-loader.ts packages/backtest/src/data-loader.test.ts
git commit -m "feat(backtest): add data loader — Kamino history with protocol estimates"
```

---

### Task 4: Simulation engine (TDD)

**Files:**
- Create: `packages/backtest/src/engine.ts`
- Create: `packages/backtest/src/engine.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest'
import { runBacktest } from './engine'
import type { HistoricalDataPoint, BacktestConfig } from './types'
import { DEFAULT_BACKTEST_CONFIG } from './types'

// 10 days of synthetic data with known APYs
function makeSyntheticData(days: number, kaminoApy: number): HistoricalDataPoint[] {
  const start = new Date('2024-01-01').getTime()
  const DAY_MS = 86_400_000
  const config = DEFAULT_BACKTEST_CONFIG
  return Array.from({ length: days }, (_, i) => {
    const marginfiApy = kaminoApy * config.marginfiApyMultiplier
    const luloApy = Math.max(kaminoApy, marginfiApy) * config.luloApyMultiplier
    return {
      timestamp: start + i * DAY_MS,
      kaminoApy,
      marginfiApy,
      luloApy,
    }
  })
}

describe('runBacktest', () => {
  it('produces correct number of data points', () => {
    const data = makeSyntheticData(100, 0.05)
    const result = runBacktest(data, DEFAULT_BACKTEST_CONFIG)
    expect(result.series).toHaveLength(100)
    expect(result.dataPoints).toBe(100)
  })

  it('all portfolios start at initialDeposit', () => {
    const data = makeSyntheticData(10, 0.05)
    const result = runBacktest(data, DEFAULT_BACKTEST_CONFIG)
    expect(result.series[0]!.portfolioValue).toBe(10000)
    expect(result.series[0]!.kaminoValue).toBe(10000)
    expect(result.series[0]!.marginfiValue).toBe(10000)
    expect(result.series[0]!.luloValue).toBe(10000)
  })

  it('portfolio grows over time with positive APY', () => {
    const data = makeSyntheticData(365, 0.05)
    const result = runBacktest(data, DEFAULT_BACKTEST_CONFIG)
    const last = result.series[result.series.length - 1]!
    expect(last.portfolioValue).toBeGreaterThan(10000)
    expect(last.kaminoValue).toBeGreaterThan(10000)
  })

  it('router outperforms lowest-yield protocol', () => {
    const data = makeSyntheticData(365, 0.05)
    const result = runBacktest(data, DEFAULT_BACKTEST_CONFIG)
    const last = result.series[result.series.length - 1]!
    // Router should outperform Kamino-only (lowest APY)
    expect(last.portfolioValue).toBeGreaterThan(last.kaminoValue)
  })

  it('computes totalReturn correctly', () => {
    const data = makeSyntheticData(365, 0.05)
    const result = runBacktest(data, DEFAULT_BACKTEST_CONFIG)
    const last = result.series[result.series.length - 1]!
    expect(result.totalReturn).toBeCloseTo((last.portfolioValue - 10000) / 10000, 4)
  })

  it('computes CAGR', () => {
    const data = makeSyntheticData(365, 0.05)
    const result = runBacktest(data, DEFAULT_BACKTEST_CONFIG)
    expect(result.cagr).toBeGreaterThan(0)
  })

  it('includes protocol comparison metrics', () => {
    const data = makeSyntheticData(365, 0.05)
    const result = runBacktest(data, DEFAULT_BACKTEST_CONFIG)
    expect(result.protocols['kamino-lending']).toBeDefined()
    expect(result.protocols['marginfi-lending']).toBeDefined()
    expect(result.protocols['lulo-lending']).toBeDefined()
    expect(result.protocols['kamino-lending']!.totalReturn).toBeGreaterThan(0)
  })

  it('sets metadata correctly', () => {
    const data = makeSyntheticData(100, 0.05)
    const result = runBacktest(data, DEFAULT_BACKTEST_CONFIG)
    expect(result.startDate).toBe('2024-01-01')
    expect(result.riskFreeRate).toBe(0.04)
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd ~/local-dev/nanuqfi && pnpm --filter @nanuqfi/backtest exec vitest run src/engine.test.ts`

- [ ] **Step 3: Implement engine**

```typescript
import type { HistoricalDataPoint, BacktestConfig, BacktestResult, BacktestDataPoint } from './types'
import { computeCagr, computeMaxDrawdown, computeSharpeRatio, computeSortinoRatio, computeVolatility } from './metrics'

const DAYS_PER_YEAR = 365

// Volatility weights for scoring (lower volatility = higher weight)
const VOLATILITY_WEIGHTS: Record<string, number> = {
  'kamino-lending': 1.0,      // lowest volatility, highest trust
  'marginfi-lending': 0.95,
  'lulo-lending': 0.90,       // aggregator adds slight risk layer
}

/**
 * Score backends and return normalized weights (sum = 1.0).
 * score = apy × volatility_weight
 */
function computeWeights(kaminoApy: number, marginfiApy: number, luloApy: number): Record<string, number> {
  const scores: Record<string, number> = {
    'kamino-lending': kaminoApy * VOLATILITY_WEIGHTS['kamino-lending']!,
    'marginfi-lending': marginfiApy * VOLATILITY_WEIGHTS['marginfi-lending']!,
    'lulo-lending': luloApy * VOLATILITY_WEIGHTS['lulo-lending']!,
  }

  const total = Object.values(scores).reduce((a, b) => a + b, 0)
  if (total === 0) return { 'kamino-lending': 1 / 3, 'marginfi-lending': 1 / 3, 'lulo-lending': 1 / 3 }

  const weights: Record<string, number> = {}
  for (const [key, score] of Object.entries(scores)) {
    weights[key] = score / total
  }
  return weights
}

/**
 * Run backtest simulation over historical data.
 * Pure function — no side effects, deterministic output.
 */
export function runBacktest(data: HistoricalDataPoint[], config: BacktestConfig): BacktestResult {
  const initial = config.initialDeposit
  let portfolioValue = initial
  let kaminoValue = initial
  let marginfiValue = initial
  let luloValue = initial

  const series: BacktestDataPoint[] = []
  const portfolioValues: number[] = []
  const dailyReturns: number[] = []

  for (let i = 0; i < data.length; i++) {
    const day = data[i]!

    if (i === 0) {
      series.push({
        timestamp: day.timestamp,
        portfolioValue: initial,
        kaminoValue: initial,
        marginfiValue: initial,
        luloValue: initial,
      })
      portfolioValues.push(initial)
      continue
    }

    // Score and weight
    const weights = computeWeights(day.kaminoApy, day.marginfiApy, day.luloApy)

    // Daily return for router (weighted sum of daily yields)
    const routerDailyReturn =
      (weights['kamino-lending']! * day.kaminoApy +
       weights['marginfi-lending']! * day.marginfiApy +
       weights['lulo-lending']! * day.luloApy) / DAYS_PER_YEAR

    // Accrue
    const prevPortfolio = portfolioValue
    portfolioValue *= 1 + routerDailyReturn
    kaminoValue *= 1 + day.kaminoApy / DAYS_PER_YEAR
    marginfiValue *= 1 + day.marginfiApy / DAYS_PER_YEAR
    luloValue *= 1 + day.luloApy / DAYS_PER_YEAR

    series.push({
      timestamp: day.timestamp,
      portfolioValue,
      kaminoValue,
      marginfiValue,
      luloValue,
    })

    portfolioValues.push(portfolioValue)
    dailyReturns.push((portfolioValue - prevPortfolio) / prevPortfolio)
  }

  const last = series[series.length - 1]!
  const days = data.length
  const totalReturn = (last.portfolioValue - initial) / initial
  const cagr = computeCagr(initial, last.portfolioValue, days)
  const maxDrawdown = computeMaxDrawdown(portfolioValues)
  const volatility = computeVolatility(dailyReturns)
  const sharpeRatio = computeSharpeRatio(cagr, config.riskFreeRate, volatility)
  const sortinoRatio = computeSortinoRatio(dailyReturns, config.riskFreeRate)

  // Protocol baselines
  const kaminoReturns = series.slice(1).map((p, i) => (p.kaminoValue - series[i]!.kaminoValue) / series[i]!.kaminoValue)
  const marginfiReturns = series.slice(1).map((p, i) => (p.marginfiValue - series[i]!.marginfiValue) / series[i]!.marginfiValue)
  const luloReturns = series.slice(1).map((p, i) => (p.luloValue - series[i]!.luloValue) / series[i]!.luloValue)

  function protocolMetrics(endValue: number, returns: number[], values: number[]) {
    const tr = (endValue - initial) / initial
    const c = computeCagr(initial, endValue, days)
    const md = computeMaxDrawdown(values)
    const vol = computeVolatility(returns)
    return { totalReturn: tr, cagr: c, maxDrawdown: md, sharpeRatio: computeSharpeRatio(c, config.riskFreeRate, vol) }
  }

  const startDate = new Date(data[0]!.timestamp).toISOString().split('T')[0]!
  const endDate = new Date(data[data.length - 1]!.timestamp).toISOString().split('T')[0]!

  return {
    totalReturn,
    cagr,
    maxDrawdown,
    sharpeRatio,
    sortinoRatio,
    volatility,
    protocols: {
      'kamino-lending': protocolMetrics(last.kaminoValue, kaminoReturns, series.map(s => s.kaminoValue)),
      'marginfi-lending': protocolMetrics(last.marginfiValue, marginfiReturns, series.map(s => s.marginfiValue)),
      'lulo-lending': protocolMetrics(last.luloValue, luloReturns, series.map(s => s.luloValue)),
    },
    series,
    startDate,
    endDate,
    dataPoints: data.length,
    riskFreeRate: config.riskFreeRate,
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd ~/local-dev/nanuqfi && pnpm --filter @nanuqfi/backtest exec vitest run src/engine.test.ts`

Expected: All 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/backtest/src/engine.ts packages/backtest/src/engine.test.ts
git commit -m "feat(backtest): add simulation engine — day-by-day scoring with protocol comparison"
```

---

### Task 5: Update exports + integration test + docs

**Files:**
- Modify: `packages/backtest/src/index.ts`
- Create: `packages/backtest/src/integration/backtest.test.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update index.ts**

```typescript
export type {
  BacktestConfig,
  BacktestResult,
  BacktestDataPoint,
  HistoricalDataPoint,
  ProtocolMetrics,
} from './types'
export { DEFAULT_BACKTEST_CONFIG } from './types'
export { runBacktest } from './engine'
export { fetchHistoricalData } from './data-loader'
export {
  computeCagr,
  computeMaxDrawdown,
  computeSharpeRatio,
  computeSortinoRatio,
  computeVolatility,
} from './metrics'
```

- [ ] **Step 2: Create integration test**

Create `packages/backtest/src/integration/backtest.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { fetchHistoricalData } from '../data-loader'
import { runBacktest } from '../engine'
import { DEFAULT_BACKTEST_CONFIG } from '../types'

const SKIP = !process.env.BACKTEST_INTEGRATION

describe.skipIf(!SKIP)('Backtest full integration', () => {
  it('runs backtest on real Kamino historical data', async () => {
    const data = await fetchHistoricalData(DEFAULT_BACKTEST_CONFIG)
    expect(data.length).toBeGreaterThan(1000)

    const result = runBacktest(data, DEFAULT_BACKTEST_CONFIG)

    console.log(`\n📊 BACKTEST RESULTS (${result.startDate} → ${result.endDate})`)
    console.log(`   Data points: ${result.dataPoints}`)
    console.log(`   NanuqFi Router: ${(result.totalReturn * 100).toFixed(2)}% total, ${(result.cagr * 100).toFixed(2)}% CAGR`)
    console.log(`   Max Drawdown: ${(result.maxDrawdown * 100).toFixed(2)}%`)
    console.log(`   Sharpe Ratio: ${result.sharpeRatio.toFixed(3)}`)
    console.log(`   Sortino Ratio: ${result.sortinoRatio.toFixed(3)}`)
    console.log(`   Volatility: ${(result.volatility * 100).toFixed(2)}%`)
    console.log(`\n   vs Individual Protocols:`)
    for (const [name, metrics] of Object.entries(result.protocols)) {
      console.log(`   ${name}: ${(metrics.totalReturn * 100).toFixed(2)}% total, ${(metrics.cagr * 100).toFixed(2)}% CAGR, Sharpe ${metrics.sharpeRatio.toFixed(3)}`)
    }

    expect(result.totalReturn).toBeGreaterThan(0)
    expect(result.cagr).toBeGreaterThan(0)
    expect(result.sharpeRatio).toBeGreaterThan(0)
    expect(result.protocols['kamino-lending']).toBeDefined()
    // Router should outperform lowest-yield protocol
    expect(result.totalReturn).toBeGreaterThan(result.protocols['kamino-lending']!.totalReturn)
  }, 30_000)
})
```

- [ ] **Step 3: Run full test suite**

Run: `cd ~/local-dev/nanuqfi && pnpm --filter @nanuqfi/backtest test`

Expected: 20 unit tests pass, 1 integration test skipped.

- [ ] **Step 4: Run integration test with live data**

Run: `cd ~/local-dev/nanuqfi && BACKTEST_INTEGRATION=1 pnpm --filter @nanuqfi/backtest exec vitest run src/integration/backtest.test.ts`

Expected: Passes with printed backtest results.

- [ ] **Step 5: Build**

Run: `cd ~/local-dev/nanuqfi && pnpm --filter @nanuqfi/backtest build`

- [ ] **Step 6: Update CLAUDE.md**

Add `@nanuqfi/backtest` section and update test counts.

- [ ] **Step 7: Commit**

```bash
git add packages/backtest/ CLAUDE.md
git commit -m "feat(backtest): integration test, exports, docs — full simulation engine complete"
```

---

### Task 6: Keeper endpoint

**Files:**
- Modify: `~/local-dev/nanuqfi-keeper/src/health/api.ts`
- Modify: `~/local-dev/nanuqfi-keeper/src/health/api.test.ts`
- Modify: `~/local-dev/nanuqfi-keeper/package.json`

This task is in the **keeper repo** (`~/local-dev/nanuqfi-keeper/`).

- [ ] **Step 1: Add @nanuqfi/backtest dependency**

The backtest package is in the core monorepo. Since the keeper is a separate repo, we inline the backtest logic by copying the key functions. Alternatively, publish the package to npm.

For the hackathon, the simplest approach: duplicate the `fetchHistoricalData` + `runBacktest` + metrics functions into a `src/backtest/` directory in the keeper. This avoids cross-repo dependency issues.

Create `~/local-dev/nanuqfi-keeper/src/backtest/index.ts` that imports from the backtest package's source files (copy the compiled output or symlink).

**Pragmatic approach:** The keeper calls the Kamino API directly (it already does for live rates), runs the simulation inline, and caches the result. No cross-repo dependency needed.

- [ ] **Step 2: Add backtest route to health API**

In `src/health/api.ts`, add a new route handler for `/v1/backtest`:

```typescript
// Add to the route handler switch/if chain:
} else if (path === '/v1/backtest') {
  const result = await data.getBacktestResult?.()
  if (result) {
    respond(res, 200, result)
  } else {
    respond(res, 503, { error: 'Backtest not available yet' })
  }
}
```

- [ ] **Step 3: Add backtest computation to keeper**

In `src/keeper.ts`, add backtest caching:

```typescript
private backtestCache: BacktestResult | null = null
private backtestTimestamp = 0
private readonly BACKTEST_CACHE_TTL = 3600_000 // 1 hour

async getBacktestResult(): Promise<BacktestResult | null> {
  if (this.backtestCache && Date.now() - this.backtestTimestamp < this.BACKTEST_CACHE_TTL) {
    return this.backtestCache
  }
  try {
    const data = await fetchHistoricalData(DEFAULT_BACKTEST_CONFIG)
    this.backtestCache = runBacktest(data, DEFAULT_BACKTEST_CONFIG)
    this.backtestTimestamp = Date.now()
    return this.backtestCache
  } catch {
    return this.backtestCache // return stale cache on error
  }
}
```

- [ ] **Step 4: Run keeper tests**

Run: `cd ~/local-dev/nanuqfi-keeper && pnpm test`

- [ ] **Step 5: Commit**

```bash
cd ~/local-dev/nanuqfi-keeper
git add src/backtest/ src/health/api.ts src/keeper.ts
git commit -m "feat: add /v1/backtest endpoint — cached historical simulation"
```
