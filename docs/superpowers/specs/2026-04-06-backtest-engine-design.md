# Backtest Engine Design Spec

**Date:** 2026-04-06
**Scope:** `@nanuqfi/backtest` — historical yield simulation engine with risk metrics and protocol comparison
**Approach:** Pure computation package in core monorepo, served via keeper API endpoint

---

## Context

NanuqFi routes yield across Kamino, Marginfi, and Lulo. Live scoring works, but judges need proof the algorithm performs across market conditions. Backtest simulates the scoring engine against 2.5 years of historical data and produces returns, risk metrics, and protocol-vs-router comparisons.

## Data Sources

- **Kamino API:** `GET /kamino-market/{market}/reserves/{reserve}/metrics/history` — 21,518 daily data points (Oct 2023 → today) with `supplyInterestAPY`
- **DeFi Llama:** `GET /chart/{poolId}` — Kamino USDC pool `d2141a59-c199-4be7-8d4b-c8223954836b` as cross-reference
- **Marginfi/Lulo proxies:** For periods before their APIs existed, use Kamino data with protocol-specific APY offsets derived from their current rate differentials

## Architecture

```
@nanuqfi/backtest (pure computation, no side effects)
        │
        ├── fetchHistoricalData() — pulls from Kamino API + DeFi Llama
        ├── runBacktest(data, config) → BacktestResult — pure function
        └── computeMetrics(series) → risk metrics
        
nanuqfi-keeper
        │
        └── GET /v1/backtest — imports @nanuqfi/backtest, caches 1 hour
        
nanuqfi-app
        │
        └── fetches /v1/backtest, renders chart + table + metrics
```

## BacktestResult Type

```typescript
interface BacktestResult {
  // Returns
  totalReturn: number              // 0.142 = 14.2%
  cagr: number                     // compound annual growth rate

  // Risk
  maxDrawdown: number              // worst peak-to-trough decline
  sharpeRatio: number              // (return - riskFree) / volatility
  sortinoRatio: number             // (return - riskFree) / downside volatility
  volatility: number               // daily return std dev, annualized

  // Protocol comparison
  protocols: Record<string, {
    totalReturn: number
    cagr: number
    maxDrawdown: number
    sharpeRatio: number
  }>

  // Time series for chart
  series: BacktestDataPoint[]

  // Metadata
  startDate: string
  endDate: string
  dataPoints: number
  riskFreeRate: number             // assumed risk-free (e.g. 0.04 = 4% T-bills)
}

interface BacktestDataPoint {
  timestamp: number                // epoch ms
  portfolioValue: number           // NanuqFi router
  kaminoValue: number              // Kamino-only baseline
  marginfiValue: number            // Marginfi-only baseline
  luloValue: number                // Lulo-only baseline
}
```

## Simulation Logic

For each day in the historical data:

1. **Get rates:** Kamino APY from history, Marginfi estimated as `kamino_apy * 1.08` (historically ~8% higher), Lulo estimated as `max(kamino, marginfi) * 1.05` (aggregator premium)
2. **Score backends:** Apply the algorithm engine's risk-adjusted scoring: `score = apy × volatility_weight × regime_multiplier`
3. **Propose weights:** Normalize scores to basis points (sum = 10,000)
4. **Accrue returns:** `portfolio_value += portfolio_value × (weighted_daily_return)` where `weighted_daily_return = sum(weight_i × apy_i / 365)`
5. **Track baselines:** Each protocol-only portfolio accrues at its own rate
6. **Record data point:** timestamp, all portfolio values

After simulation:
- Compute total return, CAGR from start/end values
- Compute max drawdown from peak-to-trough on the series
- Compute daily returns → volatility, Sharpe ratio (risk-free = 4%), Sortino ratio

## Keeper Integration

```typescript
// In keeper: GET /v1/backtest
let cachedResult: BacktestResult | null = null
let cacheTimestamp = 0
const CACHE_TTL = 3600_000 // 1 hour

app.get('/v1/backtest', async (req, res) => {
  if (cachedResult && Date.now() - cacheTimestamp < CACHE_TTL) {
    return res.json(cachedResult)
  }
  cachedResult = await runFullBacktest()
  cacheTimestamp = Date.now()
  res.json(cachedResult)
})
```

## File Structure

```
packages/backtest/
  src/
    engine.ts              ← runBacktest() pure function
    engine.test.ts
    metrics.ts             ← computeMetrics() — Sharpe, Sortino, drawdown
    metrics.test.ts
    data-loader.ts         ← fetchHistoricalData() from Kamino API + DeFi Llama
    data-loader.test.ts
    types.ts               ← BacktestResult, BacktestDataPoint, BacktestConfig
    index.ts
  package.json
  tsconfig.json
```

## Testing

- **engine.test.ts:** Feed synthetic data (known APYs), verify portfolio value math is correct
- **metrics.test.ts:** Feed known return series, verify Sharpe/Sortino/drawdown calculations
- **data-loader.test.ts:** Mock API responses, verify data parsing and proxy estimation
- Target: ~15 tests

## Dependencies

```json
{
  "dependencies": {
    "@nanuqfi/core": "workspace:*"
  }
}
```

Zero external deps. Uses native `fetch()` for API calls.

## Out of Scope

- App UI rendering (separate task after data flows)
- Real-time backtest updates (cache is sufficient)
- Monte Carlo simulation (simple historical replay is enough for hackathon)
