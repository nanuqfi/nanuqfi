# NanuqFi

**Protocol-agnostic, AI-powered yield routing layer for Solana DeFi.**

Users deposit USDC, pick a risk level, and the protocol routes capital to the best risk-adjusted yield across multiple lending protocols -- governed by on-chain guardrails and managed by an AI-enhanced keeper bot.

Live now: [nanuqfi.com](https://nanuqfi.com) | [app.nanuqfi.com](https://app.nanuqfi.com) | [keeper.nanuqfi.com](https://keeper.nanuqfi.com)

---

## Architecture

```
                         +------------------+
                         |   NanuqFi App    |
                         |  (Next.js 15)    |
                         +--------+---------+
                                  |
                    +-------------+-------------+
                    |                           |
           +--------v--------+        +--------v--------+
           |  Allocator       |        |  AI Keeper      |
           |  (Anchor/Rust)   |        |  (TS + Claude)  |
           |  27 instructions |        |  Score + Propose|
           +--------+---------+        +--------+--------+
                    |                           |
         +----------+----------+       +--------v--------+
         |          |          |       |  Algorithm       |
   +-----v--+ +----v---+ +----v---+   |  Engine          |
   |Marginfi | | Kamino | | Lulo   |   |  (Risk scoring,  |
   |Lending  | | Lending| | Agg.   |   |   regime detect) |
   +--------+  +-------+  +-------+   +-----------------+
```

**Trust model:** Users trust the auditable on-chain program, not the keeper. The keeper proposes rebalances; the algorithm engine validates; the program enforces guardrails.

---

## Quick Start

```bash
# Prerequisites: Node >= 22, pnpm, Rust, Anchor CLI
pnpm install
pnpm turbo build
pnpm turbo test          # 139 tests (unit + integration)
anchor build             # build Anchor program
anchor test              # on-chain integration tests
```

---

## Packages

| Package | Description | Deps |
|---------|-------------|------|
| `@nanuqfi/core` | Interfaces, registry, router, strategy, circuit breaker, fetchWithRetry, Logger, TtlCache | Zero external deps |
| `@nanuqfi/backend-marginfi` | Marginfi USDC lending -- real SDK, live mainnet rates, cached fetching | MarginFi SDK |
| `@nanuqfi/backend-kamino` | Kamino USDC lending -- zero-dep REST API, 21K+ historical data points | Zero external deps |
| `@nanuqfi/backend-lulo` | Lulo lending aggregator -- routes across Kamino/MarginFi/Jupiter | Zero external deps |
| `@nanuqfi/backtest` | Historical simulation engine -- 2.5 years of data, CAGR/Sharpe/Sortino/drawdown | Zero external deps |

All backends implement the same `YieldBackend` interface. Zero coupling between protocols. Add a new backend by implementing one interface.

---

## Allocator Program (Anchor/Rust)

**Program ID:** `CDhkMBnc43wJQyVaSrreXk2ojvQvZMWrAWNBLSjaRJxq` (devnet)

27 on-chain instructions across five categories:

| Category | Instructions |
|----------|-------------|
| **Lifecycle** | `initialize_allocator`, `initialize_risk_vault`, `initialize_treasury` |
| **User** | `deposit`, `request_withdraw`, `withdraw`, `close_user_position` |
| **Keeper** | `rebalance`, `acquire_lease`, `heartbeat`, `allocate_to_protocol`, `recall_from_protocol` |
| **Admin** | `emergency_halt`, `resume`, `update_keeper_authority`, `update_guardrails`, `update_deposit_cap`, `update_treasury_usdc`, `withdraw_treasury` |
| **Admin Utils** | `admin_reset_vault`, `admin_set_tvl`, `admin_set_redemption_period`, `admin_set_rebalance_counter`, `admin_set_max_single_deposit` |
| **Protocol Mgmt** | `add_whitelisted_protocol`, `remove_whitelisted_protocol` |
| **Cleanup** | `close_rebalance_record` |

### Production Hardening

- **vault_usdc constraints** -- all token accounts validated against expected mint
- **Checked math** -- every arithmetic operation uses checked_add/checked_sub/checked_mul/checked_div
- **Share inflation protection** -- minimum deposit enforced, share price manipulation prevented
- **Protocol whitelist** -- only admin-approved protocols can receive allocations
- **Event emission** -- all state-changing instructions emit Anchor events for indexing
- **Devnet-gated admin utils** -- admin_set_tvl and similar utilities restricted to non-mainnet clusters
- **Account close instructions** -- close_user_position, close_rebalance_record for rent reclamation

---

## SDK Highlights

### @nanuqfi/core

- **YieldBackend** / **BackendCapabilities** -- interface every yield source implements
- **YieldBackendRegistry** -- store and query backends by capability
- **YieldRouter** -- rank backends by risk-adjusted yield with circuit breaker
- **BaseVaultStrategy** -- abstract class with weight/guardrail validation
- **fetchWithRetry** -- exponential backoff HTTP client for all API calls
- **Logger** -- pluggable logger (console or noop for tests)
- **TtlCache** -- stale-while-revalidate caching with configurable TTL
- **CircuitBreaker** -- CLOSED / OPEN / HALF_OPEN state machine

### @nanuqfi/backtest

Proves the router outperforms any single protocol. 21K+ daily data points from Oct 2023 through Apr 2026. Metrics: CAGR, Sharpe ratio, Sortino ratio, max drawdown, volatility. Available via `/v1/backtest` on the keeper API.

---

## CI Pipeline

GitHub Actions on every push and PR:

1. `pnpm turbo build` -- compile all packages
2. `pnpm turbo lint` -- ESLint strict mode
3. `pnpm turbo test` -- 139 unit + integration tests
4. `pnpm audit` -- npm dependency security audit
5. `cargo audit` -- Rust dependency security audit

---

## Tests

| Package | Tests |
|---------|-------|
| `@nanuqfi/core` | 45 |
| `@nanuqfi/backend-marginfi` | 29 |
| `@nanuqfi/backend-kamino` | 20 |
| `@nanuqfi/backend-lulo` | 21 |
| `@nanuqfi/backtest` | 24 |
| **This repo total** | **139** |
| nanuqfi-keeper | 206 |
| nanuqfi-app | 12 |
| **Ecosystem total** | **357** |

---

## Live Deployments

| Service | URL | Stack |
|---------|-----|-------|
| Marketing site | [nanuqfi.com](https://nanuqfi.com) | Next.js 16, static export |
| Dashboard | [app.nanuqfi.com](https://app.nanuqfi.com) | Next.js 15, React 19 |
| Keeper API | [keeper.nanuqfi.com](https://keeper.nanuqfi.com) | TypeScript, Docker |
| Allocator | Solana devnet | Anchor/Rust |

---

## Related Repositories

| Repo | Purpose |
|------|---------|
| [nanuqfi-keeper](https://github.com/nanuqfi/nanuqfi-keeper) | AI keeper bot -- algorithm engine + Claude AI reasoning + health monitoring |
| [nanuqfi-app](https://github.com/nanuqfi/nanuqfi-app) | Frontend dashboard -- custom components, dark mode, transparency UI |
| [nanuqfi-web](https://github.com/nanuqfi/nanuqfi-web) | Marketing site -- nanuqfi.com |

---

## License

[BUSL-1.1](LICENSE) -- Business Source License 1.1. Converts to MIT on 2030-04-07.
