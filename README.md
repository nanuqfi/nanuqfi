<div align="center">

<pre>
███╗   ██╗ █████╗ ███╗   ██╗██╗   ██╗ ██████╗ ███████╗██╗
████╗  ██║██╔══██╗████╗  ██║██║   ██║██╔═══██╗██╔════╝██║
██╔██╗ ██║███████║██╔██╗ ██║██║   ██║██║   ██║█████╗  ██║
██║╚██╗██║██╔══██║██║╚██╗██║██║   ██║██║▄▄ ██║██╔══╝  ██║
██║ ╚████║██║  ██║██║ ╚████║╚██████╔╝╚██████╔╝██║     ██║
╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝  ╚══▀▀═╝ ╚═╝     ╚═╝
</pre>

### The Yield Routing Layer for DeFi

Deposit USDC. Pick your risk. AI routes your capital to the best yield across Solana lending protocols.

[![CI](https://github.com/nanuqfi/nanuqfi/actions/workflows/ci.yml/badge.svg)](https://github.com/nanuqfi/nanuqfi/actions/workflows/ci.yml)
[![License: BSL-1.1](https://img.shields.io/badge/License-BSL--1.1-blue.svg)](LICENSE)
[![Tests: 540](https://img.shields.io/badge/Tests-540-brightgreen.svg)](#tests)
[![Solana](https://img.shields.io/badge/Solana-devnet-9945FF.svg)](https://solana.com)
[![Rust](https://img.shields.io/badge/Rust-Anchor%200.30.1-dea584.svg)](https://www.anchor-lang.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg)](https://www.typescriptlang.org)

**[nanuqfi.com](https://nanuqfi.com)** | **[keeper.nanuqfi.com/v1/status](https://keeper.nanuqfi.com/v1/status)**

</div>

---

## Why NanuqFi

| Problem | NanuqFi |
|---------|---------|
| Yield farming is manual and fragmented | Automated routing across Kamino, Marginfi, Lulo |
| Users trust opaque vaults | On-chain guardrails -- users trust the program, not the operator |
| Protocol risk is concentrated | AI keeper scores protocols, enforces diversification limits |
| Rebalancing is reactive | Continuous monitoring with autonomous rebalance proposals |
| No historical proof | 2.5 years of backtested data proves router beats single-protocol strategies |

---

## Architecture

```
User                    Keeper (AI)                 On-Chain Program
  |                         |                            |
  |-- deposit USDC -------->|                            |
  |                         |-- score protocols -------->|
  |                         |-- propose rebalance ------>|
  |                         |     (weights + reasoning)  |
  |                         |                            |-- validate guardrails
  |                         |                            |-- enforce limits
  |                         |                            |-- emit events
  |                         |                            |
  |<-- shares minted -------|                            |
  |                         |                            |
  |-- request withdraw ---->|                            |
  |     (time-locked)       |                            |
  |<-- USDC returned -------|                            |
```

**Trust model:** The keeper proposes. The algorithm validates. The program enforces. Users trust auditable on-chain code -- never the operator.

---

## What's Inside

### Allocator Program (Anchor/Rust)

**27 on-chain instructions** -- deployed to Solana devnet

```
Program ID: 2QtJ5kmxLuW2jYCFpJMtzZ7PCnKdoMwkeueYoDUi5z5P
```

| Category | Instructions |
|----------|-------------|
| Lifecycle | `initialize_allocator`, `initialize_risk_vault`, `initialize_treasury` |
| User Flow | `deposit`, `request_withdraw`, `withdraw`, `close_user_position` |
| Keeper Ops | `rebalance`, `acquire_lease`, `heartbeat`, `allocate_to_protocol`, `recall_from_protocol` |
| Admin | `emergency_halt`, `resume`, `update_keeper_authority`, `update_guardrails`, `update_deposit_cap`, `update_treasury_usdc`, `withdraw_treasury` |
| Protocol Mgmt | `add_whitelisted_protocol`, `remove_whitelisted_protocol` |
| Cleanup | `close_rebalance_record`, `admin_reset_vault` (devnet), `admin_set_tvl` (devnet), `admin_set_redemption_period`, `admin_set_rebalance_counter` (devnet), `admin_set_max_single_deposit` |

### Security Hardening

Every line written as if it ships to mainnet tonight:

- **Token account validation** -- `vault_usdc` constrained to correct mint + authority in every instruction
- **Checked arithmetic** -- zero `saturating_sub` in financial paths; underflow = explicit error
- **Share inflation protection** -- virtual offset + minimum first deposit defeats ERC-4626 griefing
- **Protocol whitelist** -- keeper can only allocate to admin-approved destinations
- **Event emission** -- every state change emits an Anchor event for indexers
- **Devnet-gated utilities** -- `#[cfg(feature = "devnet")]` removes admin test tools from mainnet builds
- **Cumulative fee accounting** -- `total_fees_collected` is append-only; separate `total_fees_withdrawn` counter
- **Per-transaction deposit limits** -- prevents flash-loan-style attacks
- **Guardrail bounds** -- admin can't set redemption period below minimum safe value

### SDK Packages

| Package | What It Does | External Deps |
|---------|-------------|---------------|
| `@nanuqfi/core` | Interfaces, router, circuit breaker, fetchWithRetry, Logger, TtlCache | None |
| `@nanuqfi/backend-marginfi` | Marginfi USDC lending -- live mainnet rates via SDK | MarginFi SDK |
| `@nanuqfi/backend-kamino` | Kamino USDC lending -- pure HTTP, 21K+ historical data points | None |
| `@nanuqfi/backend-lulo` | Lulo aggregator -- routes across Kamino/MarginFi/Jupiter | None |
| `@nanuqfi/backtest` | Historical simulation -- CAGR, Sharpe, Sortino, drawdown over 2.5 years | None |

All backends implement `YieldBackend`. Add a new protocol by implementing one interface.

---

## Performance

Backtested across 2.5 years of historical data (21,000+ daily data points from Kamino, with Marginfi and Lulo estimates):

| Metric | NanuqFi Router | Single Protocol |
|--------|---------------|-----------------|
| CAGR | ~16.1% | ~5.5% |
| Sharpe Ratio | 2.95 | -- |
| Sortino Ratio | 4.86 | -- |
| Max Drawdown | 1.89% | -- |

The router consistently outperforms any single-protocol strategy by dynamically scoring and weighting across all available yield sources. Full backtest available at `keeper.nanuqfi.com/v1/backtest`.

---

## Quick Start

```bash
pnpm install                    # install deps
pnpm turbo build                # compile all packages
pnpm turbo lint                 # ESLint strict mode
pnpm turbo test                 # 308 tests across 6 packages
anchor build                    # build Anchor program
anchor deploy --provider.cluster devnet   # deploy to devnet
npx tsx scripts/setup-devnet.ts           # initialize accounts
npx tsx scripts/e2e-gate.ts               # run E2E gate (9 steps)
```

---

## Tests

| Scope | Count |
|-------|-------|
| `@nanuqfi/core` | 57 |
| `@nanuqfi/backend-marginfi` | 44 |
| `@nanuqfi/backend-kamino` | 36 |
| `@nanuqfi/backend-lulo` | 48 |
| `@nanuqfi/backtest` | 24 |
| Rust allocator | 99 |
| **Core monorepo** | **308** |
| nanuqfi-keeper | 206 |
| nanuqfi-app | 26 |
| **Ecosystem total** | **540** |

CI runs on every push: build, lint, test, `pnpm audit`, `cargo audit`.

---

## Live

| What | Where | Stack |
|------|-------|-------|
| Website + App | [nanuqfi.com](https://nanuqfi.com) | Next.js 16, React 19, Tailwind 4 |
| Strategy Docs | [nanuqfi.com/strategy](https://nanuqfi.com/strategy) | Hackathon pitch documentation |
| Keeper API | [keeper.nanuqfi.com](https://keeper.nanuqfi.com/v1/status) | TypeScript, Docker, Claude AI |
| Program | Solana devnet | Anchor 0.30.1, Rust |
| TVL | ~260 USDC | Moderate + Aggressive vaults |

---

## Ecosystem

| Repo | Purpose |
|------|---------|
| [nanuqfi](https://github.com/nanuqfi/nanuqfi) | Core monorepo -- SDK + Anchor program (you are here) |
| [nanuqfi-keeper](https://github.com/nanuqfi/nanuqfi-keeper) | AI keeper bot -- algorithm engine + Claude reasoning |
| [nanuqfi-app](https://github.com/nanuqfi/nanuqfi-app) | Frontend -- marketing + dashboard + vault management (consolidated) |
| ~~[nanuqfi-web](https://github.com/nanuqfi/nanuqfi-web)~~ | Archived -- marketing consolidated into nanuqfi-app |

---

## License

Business Source License 1.1 -- see [LICENSE](LICENSE).
