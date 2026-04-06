# NanuqFi

### The Yield Routing Layer for DeFi

Deposit USDC. Pick your risk. NanuqFi routes your capital to the best risk-adjusted yield across Solana lending protocols — autonomously, transparently, and with on-chain guardrails that even the keeper can't bypass.

**[nanuqfi.com](https://nanuqfi.com)** | **[app.nanuqfi.com](https://app.nanuqfi.com)** | **[keeper.nanuqfi.com/v1/status](https://keeper.nanuqfi.com/v1/status)**

---

## Why NanuqFi

| Problem | NanuqFi |
|---------|---------|
| Yield farming is manual and fragmented | Automated routing across Kamino, Marginfi, Lulo |
| Users trust opaque vaults | On-chain guardrails — users trust the program, not the operator |
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

**Trust model:** The keeper proposes. The algorithm validates. The program enforces. Users trust auditable on-chain code — never the operator.

---

## What's Inside

### Allocator Program (Anchor/Rust)

**27 on-chain instructions** — deployed to Solana devnet

```
Program ID: CDhkMBnc43wJQyVaSrreXk2ojvQvZMWrAWNBLSjaRJxq
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

- **Token account validation** — `vault_usdc` constrained to correct mint + authority in every instruction
- **Checked arithmetic** — zero `saturating_sub` in financial paths; underflow = explicit error
- **Share inflation protection** — virtual offset + minimum first deposit defeats ERC-4626 griefing
- **Protocol whitelist** — keeper can only allocate to admin-approved destinations
- **Event emission** — every state change emits an Anchor event for indexers
- **Devnet-gated utilities** — `#[cfg(feature = "devnet")]` removes admin test tools from mainnet builds
- **Cumulative fee accounting** — `total_fees_collected` is append-only; separate `total_fees_withdrawn` counter
- **Per-transaction deposit limits** — prevents flash-loan-style attacks
- **Guardrail bounds** — admin can't set redemption period below minimum safe value

### SDK Packages

| Package | What It Does | External Deps |
|---------|-------------|---------------|
| `@nanuqfi/core` | Interfaces, router, circuit breaker, fetchWithRetry, Logger, TtlCache | None |
| `@nanuqfi/backend-marginfi` | Marginfi USDC lending — live mainnet rates via SDK | MarginFi SDK |
| `@nanuqfi/backend-kamino` | Kamino USDC lending — pure HTTP, 21K+ historical data points | None |
| `@nanuqfi/backend-lulo` | Lulo aggregator — routes across Kamino/MarginFi/Jupiter | None |
| `@nanuqfi/backtest` | Historical simulation — CAGR, Sharpe, Sortino, drawdown over 2.5 years | None |

All backends implement `YieldBackend`. Add a new protocol by implementing one interface.

---

## Quick Start

```bash
pnpm install                    # install deps
pnpm turbo build                # compile all packages
pnpm turbo lint                 # ESLint strict mode
pnpm turbo test                 # 139 tests across 5 packages
anchor build                    # build Anchor program
anchor deploy --provider.cluster devnet   # deploy to devnet
npx tsx scripts/setup-devnet.ts           # initialize accounts
npx tsx scripts/e2e-gate.ts               # run E2E gate (9 steps)
```

---

## Tests

| Scope | Count |
|-------|-------|
| `@nanuqfi/core` | 45 |
| `@nanuqfi/backend-marginfi` | 29 |
| `@nanuqfi/backend-kamino` | 20 |
| `@nanuqfi/backend-lulo` | 21 |
| `@nanuqfi/backtest` | 24 |
| **Core monorepo** | **139** |
| nanuqfi-keeper | 206 |
| nanuqfi-app | 12 |
| **Ecosystem total** | **357** |

CI runs on every push: build, lint, test, `pnpm audit`, `cargo audit`.

---

## Live

| What | Where | Stack |
|------|-------|-------|
| Marketing | [nanuqfi.com](https://nanuqfi.com) | Next.js 16, static export |
| Dashboard | [app.nanuqfi.com](https://app.nanuqfi.com) | Next.js 15, React 19, Tailwind 4 |
| Keeper API | [keeper.nanuqfi.com](https://keeper.nanuqfi.com/v1/status) | TypeScript, Docker, Claude AI |
| Program | Solana devnet | Anchor 0.30.1, Rust |
| TVL | 200 USDC | Moderate + Aggressive vaults |

---

## Ecosystem

| Repo | Purpose |
|------|---------|
| [nanuqfi](https://github.com/nanuqfi/nanuqfi) | Core monorepo — SDK + Anchor program (you are here) |
| [nanuqfi-keeper](https://github.com/nanuqfi/nanuqfi-keeper) | AI keeper bot — algorithm engine + Claude reasoning + Telegram alerts |
| [nanuqfi-app](https://github.com/nanuqfi/nanuqfi-app) | Dashboard — custom components, dark mode, transparency UI |
| [nanuqfi-web](https://github.com/nanuqfi/nanuqfi-web) | Marketing site — nanuqfi.com |

---

## License

Business Source License 1.1 — see [LICENSE](LICENSE).
