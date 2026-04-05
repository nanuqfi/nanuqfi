# Real Marginfi Backend Design Spec

**Date:** 2026-04-05
**Scope:** `@nanuqfi/backend-marginfi` — upgrade from mock stub to real Marginfi SDK integration with mainnet data + backtest support
**Approach:** Hybrid — MarginfiClient SDK for live on-chain reads, DeFi Llama for historical backtest data

---

## Context

Drift Protocol was hacked for $285M on 2026-04-01. All Drift-based strategies are disqualified from the Ranger Build-A-Bear hackathon. NanuqFi's protocol-agnostic architecture (`YieldBackend` interface) means we swap backends, not rewrite.

The current `@nanuqfi/backend-marginfi` is a mock stub (7 tests, 6.5% APY hardcoded). This spec upgrades it to real mainnet data with backtest capability.

## Requirements

- **USDC lending only** — no multi-asset, no looping, no leverage
- **Mainnet data** — all rate reads from mainnet Marginfi banks
- **Mock mode** — unit tests run offline with deterministic data
- **Backtest support** — historical yield data for proving strategy performance
- **Backward compatible** — existing 7 tests must still pass

## Architecture

```
┌─────────────────────────────────────────────────┐
│               MarginfiLendingBackend            │
│         implements YieldBackend interface        │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐ │
│  │ MockMode │  │  LiveMode    │  │ Backtest  │ │
│  │ (tests)  │  │ (MarginfiSDK)│  │  DataAPI  │ │
│  └──────────┘  └──────────────┘  └───────────┘ │
│       │              │                 │        │
│       │         mainnet RPC       DeFi Llama    │
│       │         bank.compute      /chart/{id}   │
│       │         InterestRates()                 │
└─────────────────────────────────────────────────┘
```

## Data Layer

### Live Rates (MarginfiClient on mainnet)

- `MarginfiClient.fetch(config, wallet, connection)` with mainnet RPC
- `client.getBankByTokenSymbol("USDC")` → `bank.computeInterestRates()` → `lendingRate`
- `bank.computeUtilizationRate()`, `bank.getTotalAssetQuantity()` for risk metrics
- Read-only — dummy keypair for SDK init, no signing required

### Historical Rates (backtest)

DeFi Llama does NOT list Marginfi lending pools in their yields API (only `marginfi-lst`). For backtest:
- DeFi Llama chart data for protocols that have it (Kamino: pool `d2141a59-c199-4be7-8d4b-c8223954836b`)
- Rate snapshotter utility that collects `bank.computeInterestRates()` on a schedule and stores to JSON
- For hackathon demo: seed historical estimates based on comparable Solana USDC lending protocols

### Mock Mode (unit tests)

- Configurable mock APY/volatility via constructor
- Zero network calls, deterministic returns
- Same pattern as `DriftLendingBackend` mock mode

## Backend Implementation

### Config

```typescript
interface MarginfiLendingConfig {
  mockMode?: boolean            // default true
  mockApy?: number              // default 0.065
  mockVolatility?: number       // default 0.04
  marginfiClient?: MarginfiClient  // required for real mode
}
```

### Method Behavior

| Method | Mock Mode | Real Mode |
|--------|-----------|-----------|
| `getExpectedYield()` | Configured APY | `bank.computeInterestRates().lendingRate` from mainnet |
| `getRisk()` | Configured risk | Utilization-based via `bank.computeUtilizationRate()` |
| `estimateSlippage()` | 2 bps | Available liquidity check vs requested amount |
| `deposit()` | Mock tx sig | Stub: `"pending-allocator-cpi"` (allocator handles real deposits) |
| `withdraw()` | Mock tx sig | Stub: `"pending-allocator-cpi"` (allocator handles real withdrawals) |
| `getPosition()` | In-memory tracking | Query Marginfi account `activeBalances` |

`deposit()`/`withdraw()` stay as stubs in real mode — the on-chain allocator program handles actual capital movement via CPI (Phase 5). The backend is a data + scoring layer.

## Utilities

### `marginfi-connection.ts`

Factory function following `drift-connection.ts` pattern:
- `createMarginfiClient(rpcUrl: string)` → `MarginfiClient`
- Mainnet config via `getConfig("production")`
- Read-only wallet (`Keypair.generate()`)
- Connection with `confirmed` commitment

### `marginfi-data-api.ts`

Data fetching following `drift-data-api.ts` pattern:
- `fetchLendingRate(client: MarginfiClient, tokenSymbol: string)` → `number` (APY decimal)
- `fetchBankMetrics(client: MarginfiClient, tokenSymbol: string)` → `{ utilization, totalAssets, totalLiabilities, tvl }`
- `fetchHistoricalRates(poolId: string, days: number)` → DeFi Llama chart data (for protocols that support it)
- 60-second in-memory cache on rate fetches

## Testing Strategy

### Unit Tests (mock mode, offline)

- Existing 7 tests pass unchanged (backward compatible)
- Mock/real mode toggle behavior
- Config validation (throws without client in real mode)
- Rate conversion correctness
- Risk metric computation from utilization

### Integration Tests (real mode, mainnet RPC)

- Fetch live USDC lending rate from mainnet Marginfi
- Verify bank exists with non-zero TVL
- Verify rate is reasonable (0.1% - 30% APY range)
- Guarded with `describe.skipIf(!process.env.SOLANA_RPC_URL)` — skip in CI without RPC

**Target:** 15-20 tests total (up from 7)

## File Structure

```
packages/backend-marginfi/
  src/
    backends/
      lending.ts                  ← refactored: mock + real mode
      lending.test.ts             ← expanded: 15-20 tests
    utils/
      marginfi-connection.ts      ← new: client factory
      marginfi-connection.test.ts ← new
      marginfi-data-api.ts        ← new: rate fetch + cache
      marginfi-data-api.test.ts   ← new
    index.ts                      ← updated exports
```

## Dependencies

```json
{
  "dependencies": {
    "@nanuqfi/core": "workspace:*",
    "@mrgnlabs/marginfi-client-v2": "latest",
    "@mrgnlabs/mrgn-common": "latest",
    "@solana/web3.js": "^1.x",
    "@coral-xyz/anchor": "^0.30.x"
  }
}
```

`@solana/web3.js` and `@coral-xyz/anchor` already in monorepo from `backend-drift`.

## Out of Scope (later phases)

- Marginfi CPI in allocator program (Phase 5)
- Kamino backend (Phase 2)
- Lulo aggregator backend (Phase 3)
- Keeper backend config swap (Phase 4)
- App/marketing Drift→Marginfi references (Phase 6)
