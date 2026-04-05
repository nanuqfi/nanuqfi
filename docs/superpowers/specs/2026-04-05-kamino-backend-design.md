# Kamino Backend Design Spec

**Date:** 2026-04-05
**Scope:** `@nanuqfi/backend-kamino` — new Kamino USDC lending backend with live mainnet rates + historical backtest
**Approach:** Kamino REST API (`api.kamino.finance`) for both live and historical data — no SDK dependency needed

---

## Context

Phase 2 of the Drift pivot. Marginfi backend (Phase 1) is complete but the SDK has a broken IDL. Kamino provides a production REST API with live rates AND 21,000+ historical data points — ideal for the backtest proof layer.

## Requirements

- **USDC lending only** — supply APY from Kamino's main lending market
- **Mainnet data** — live rates from Kamino REST API
- **Mock mode** — unit tests run offline with deterministic data
- **Historical backtest** — Kamino API provides daily metrics since Oct 2023
- **DeFi Llama** — also available as pool `d2141a59-c199-4be7-8d4b-c8223954836b`
- **No klend-sdk** — pure REST API, no heavy SDK dependency

## Data Sources

### Live Rates (Kamino REST API)

**Endpoint:** `GET /kamino-market/{marketPubkey}/reserves/metrics`

Market: `7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF`
USDC Reserve: `D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59`

Response (USDC entry):
```json
{
  "reserve": "D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59",
  "liquidityToken": "USDC",
  "supplyApy": "0.020840328358739946",
  "borrowApy": "0.037965590354963386",
  "totalSupply": "209158034.71851877276",
  "totalBorrow": "155203381.42068...",
  "totalSupplyUsd": "209149241.71473920623",
  "maxLtv": "0.8"
}
```

APY is already decimal (0.0208 = 2.08%). No conversion needed.

### Historical Rates (Kamino REST API)

**Endpoint:** `GET /kamino-market/{marketPubkey}/reserves/{reservePubkey}/metrics/history`

Returns 21,518 data points (Oct 2023 - present), each with `supplyInterestAPY`, `borrowInterestAPY`, `depositTvl`, `borrowTvl`, utilization, etc.

### DeFi Llama (alternative/comparison)

Pool `d2141a59-c199-4be7-8d4b-c8223954836b` — can use existing `defillama-api.ts` from backend-marginfi.

## Architecture

```
┌─────────────────────────────────────────────────┐
│               KaminoLendingBackend              │
│         implements YieldBackend interface        │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐ │
│  │ MockMode │  │  LiveMode    │  │ Historical │ │
│  │ (tests)  │  │ (Kamino API) │  │(Kamino API)│ │
│  └──────────┘  └──────────────┘  └───────────┘ │
│       │              │                 │        │
│       │     api.kamino.finance   /metrics/history│
│       │     /reserves/metrics                   │
└─────────────────────────────────────────────────┘
```

## Backend Implementation

### Config

```typescript
interface KaminoLendingConfig {
  mockMode?: boolean            // default true
  mockApy?: number              // default 0.045
  mockVolatility?: number       // default 0.03
  apiBaseUrl?: string           // default 'https://api.kamino.finance'
}
```

No client injection needed — just HTTP fetch. `apiBaseUrl` is configurable for testing.

### Method Behavior

| Method | Mock Mode | Real Mode |
|--------|-----------|-----------|
| `getExpectedYield()` | Configured APY | `supplyApy` from `/reserves/metrics` |
| `getRisk()` | Configured risk | Utilization-based from API metrics |
| `estimateSlippage()` | 2 bps | Available liquidity check |
| `deposit()` | Mock tx sig | Stub (allocator CPI) |
| `withdraw()` | Mock tx sig | Stub (allocator CPI) |
| `getPosition()` | In-memory tracking | In-memory tracking |

## Utilities

### `kamino-api.ts`

Data fetching with cache:
- `fetchKaminoReserveMetrics(apiBaseUrl: string)` → USDC reserve metrics
- `fetchKaminoHistoricalRates(apiBaseUrl: string)` → historical APY timeseries
- 60-second in-memory cache on live rates

## File Structure

```
packages/backend-kamino/
  src/
    backends/
      lending.ts              ← YieldBackend implementation
      lending.test.ts
    utils/
      kamino-api.ts           ← REST API client + cache
      kamino-api.test.ts
    index.ts
  package.json
  tsconfig.json
```

## Dependencies

```json
{
  "dependencies": {
    "@nanuqfi/core": "workspace:*"
  }
}
```

Zero external deps beyond core — just `fetch()` for HTTP calls.

## Testing

- Unit tests: mock mode + mocked fetch for API calls (~15 tests)
- Integration tests: live Kamino API (guarded, ~3 tests)
- Target: ~18 tests total
