# CLAUDE.md - NanuqFi Ecosystem

**Organization:** https://github.com/nanuqfi
**Website:** nanuqfi.com
**Purpose:** This file contains ecosystem-wide context for AI assistants working across all NanuqFi repositories

---

## ECOSYSTEM OVERVIEW

NanuqFi is a protocol-agnostic, AI-powered yield routing layer for DeFi. Users deposit USDC, pick a risk level, and the protocol routes capital to the best risk-adjusted yield across multiple strategies — governed by on-chain guardrails and managed by an AI-enhanced keeper bot.

**Endgame:** Route capital across any yield source, any protocol, any chain. Today: Marginfi, Kamino, Lulo on Solana. Tomorrow: Mango, Hyperliquid, cross-chain.

### Related Repositories

| Repo | Purpose | Tech Stack | Path |
|------|---------|------------|------|
| `nanuqfi/nanuqfi` | **Core monorepo** — SDK packages + Anchor program | TypeScript, Rust/Anchor, pnpm + Turborepo | `~/local-dev/nanuqfi/` |
| `nanuqfi/nanuqfi-keeper` | **AI Keeper** — strategy bot with algorithm engine + Claude AI | TypeScript, Anthropic SDK | `~/local-dev/nanuqfi-keeper/` |
| `nanuqfi/nanuqfi-app` | **Frontend** — dashboard with transparency UI | Next.js 15, Tailwind 4, React 19 | `~/local-dev/nanuqfi-app/` |
| `nanuqfi/nanuqfi-web` | **Marketing site** — landing page at nanuqfi.com | Next.js 16 (static export), Tailwind 4 | `~/local-dev/nanuqfi-web/` |

**Organization Mission:** Build the yield routing layer for DeFi — transparent, trustless, AI-enhanced.

---

## CROSS-REPO STANDARDS

### Coding Standards
- 2-space indentation (TypeScript), standard Rust formatting (Anchor)
- TypeScript strict mode everywhere
- No AI attribution in commits (no Co-Authored-By)
- One commit per feature/fix, never batch
- Commit messages: conventional commits (`feat:`, `fix:`, `chore:`)

### Testing
- TDD: write tests BEFORE implementation
- Tests must NEVER hang — explicit timeouts (5s unit, 30s integration)
- Every async test has proper setup/teardown (AbortController, close connections)
- Unit tests offline (mock mode), integration tests on devnet
- Coverage target: 80%+ (90%+ for keeper and allocator)

### AI Keeper Hardening
- ALWAYS consider failure modes on every keeper change
- Before claiming any keeper task complete, run through: AI layer failures, algorithm engine failures, Marginfi/Kamino/Lulo/Solana failures, process failures, economic edge cases, cascading failures

### UI Standards
- Custom components ONLY — zero off-the-shelf UI libraries
- Brand guidelines (`nanuqfi-app/docs/brand-guidelines.md`) as source of truth
- Dark mode default

### Quality Gate
- Don't ship Phase N+1 until Phase N is bulletproof
- Phases are about build order and quality, not scope limits

---

## REPOSITORY INDEX

### 1. nanuqfi/nanuqfi (Core Monorepo) - **YOU ARE HERE**

**Purpose:** Protocol-agnostic SDK (`@nanuqfi/core`, `@nanuqfi/backend-marginfi`, `@nanuqfi/backend-kamino`, `@nanuqfi/backend-lulo`) + on-chain allocator program
**Tech Stack:** TypeScript, Rust/Anchor 0.30.1, pnpm + Turborepo, Vitest

**Key Commands:**
```bash
pnpm install                    # install deps
pnpm turbo build                # build all packages
pnpm turbo test                 # run all unit tests
anchor build                    # build Anchor program
anchor test                     # run Anchor integration tests
```

**Package Structure:**
```
packages/
  core/              → @nanuqfi/core (zero-dep interfaces, registry, router, strategy)
  backend-marginfi/  → @nanuqfi/backend-marginfi (Marginfi lending — real SDK integration)
  backend-kamino/    → @nanuqfi/backend-kamino (Kamino USDC lending — zero-dep REST API)
  backend-lulo/      → @nanuqfi/backend-lulo (Lulo aggregator — routes across Kamino/MarginFi/Jupiter)
  backtest/          → @nanuqfi/backtest (historical simulation engine — CAGR, Sharpe, Sortino, drawdown)
programs/
  allocator/         → Anchor program (21 instructions, on-chain guardrails + generic protocol alloc + admin utils)
scripts/
  setup-devnet.ts    → Initialize allocator accounts on devnet
  e2e-gate.ts        → 10-step pre-mainnet E2E test
  fix-treasury-usdc.ts → Fix treasury USDC mint mismatch (B19 fix)
  test-phase-b.ts    → Phase B extended on-chain tests (B17-B22)
```

**Key Files:**
- `packages/core/src/interfaces.ts` — YieldBackend, BackendCapabilities
- `packages/core/src/router.ts` — YieldRouter with circuit breaker
- `packages/core/src/strategy.ts` — BaseVaultStrategy
- `programs/allocator/src/lib.rs` — All 21 instructions (generic alloc/recall + deposit cap + admin utils)
- `programs/allocator/src/state.rs` — Account structs (Allocator, RiskVault, UserPosition, etc.)
- `docs/superpowers/specs/2026-03-15-nanuqfi-vault-strategy-design.md` — Design spec
- `docs/superpowers/specs/2026-03-15-nanuqfi-integration-design.md` — Integration spec
- `docs/superpowers/plans/2026-03-15-nanuqfi-implementation.md` — Implementation plan

**Program ID:** `2QtJ5kmxLuW2jYCFpJMtzZ7PCnKdoMwkeueYoDUi5z5P`

---

### 2. nanuqfi/nanuqfi-keeper

**Purpose:** AI-powered keeper bot — algorithm engine + Claude AI reasoning + health monitoring + on-chain rebalance + Telegram alerts
**Tech Stack:** TypeScript, Anthropic SDK, Vitest
**CLAUDE.md:** See `~/local-dev/nanuqfi-keeper/CLAUDE.md`

**Key Commands:**
```bash
pnpm test                       # run all tests (206 tests)
pnpm build                      # compile TypeScript
pnpm dev                        # run with tsx (dev mode)
docker build -t nanuqfi-keeper . # build Docker image
```

---

### 3. nanuqfi/nanuqfi-app

**Purpose:** Frontend dashboard with transparency UI — custom components, dark mode, brand-driven
**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind 4
**CLAUDE.md:** See `~/local-dev/nanuqfi-app/CLAUDE.md`

**Key Commands:**
```bash
pnpm dev                        # local dev server
pnpm build                      # production build
pnpm lint                       # ESLint
```

---

## CURRENT FOCUS

See [ROADMAP.md](ROADMAP.md) for detailed tracking.

**Hackathon:** Ranger Build-A-Bear — deadline April 17, 2026
**Domain:** nanuqfi.com (marketing) + app.nanuqfi.com (dashboard) + keeper.nanuqfi.com (API)
**Phase:** All phases complete. Strategy, risk, technical, production, novelty — all shipped.
**Tests:** 339 total (28 core + 29 backend-marginfi + 20 backend-kamino + 21 backend-lulo + 23 backtest + 206 keeper + 12 frontend)
**Program:** 21 instructions (17 core + 2 generic alloc + 2 admin utilities)
**On-chain TVL:** ~260 USDC (moderate: 210, aggressive: 50)

---

# NANUQFI CORE REPOSITORY

> **Note:** Sections below are specific to this repository.

## Architecture

The core monorepo publishes four npm packages and one Anchor program:

### @nanuqfi/core (zero external dependencies)
- `YieldBackend` / `BackendCapabilities` — interfaces every yield source implements
- `YieldBackendRegistry` — stores and queries backends by capability
- `YieldRouter` — ranks backends by risk-adjusted yield, with circuit breaker
- `BaseVaultStrategy` — abstract class with weight/guardrail validation
- `MockYieldBackend` — deterministic mock for testing
- `CircuitBreaker` — CLOSED → OPEN → HALF_OPEN state machine

### @nanuqfi/backend-marginfi (real Marginfi SDK integration)
- `MarginfiLendingBackend` — USDC lending with mock + real mode (live mainnet rates via MarginfiClient)
- `createReadOnlyMarginfiClient` — connection factory for mainnet bank data reads
- `fetchLendingRate` / `fetchBankMetrics` — cached on-chain rate fetching (60s TTL)
- `fetchHistoricalRates` — DeFi Llama historical APY timeseries for backtesting
- Implements same `YieldBackend` interface as Drift backends — zero coupling to Drift

### @nanuqfi/backend-kamino (zero-dep REST API integration)
- `KaminoLendingBackend` — USDC lending with mock + real mode (live mainnet rates via Kamino REST API)
- `fetchUsdcReserveMetrics` — live reserve data (APY, TVL, utilization)
- `fetchHistoricalMetrics` — 21,000+ daily data points since Oct 2023 for backtesting
- Zero SDK dependency — pure HTTP via `api.kamino.finance`
- Implements same `YieldBackend` interface — zero coupling to any specific protocol

### @nanuqfi/backend-lulo (Lulo lending aggregator)
- `LuloLendingBackend` — USDC via Lulo aggregator (mock + real mode, live mainnet rates)
- `fetchLuloRates` — current + 24h APY rates from `api.lulo.fi/v1/rates.getRates` (converts % → decimal)
- `fetchLuloPoolData` — pool TVL, utilization, and per-pool APYs from `api.lulo.fi/v1/pool.getPools`
- Lulo routes across Kamino, Drift, MarginFi, Jupiter for best yield — "yield aggregator on aggregator"
- Requires `x-api-key` header for all requests (env: `LULO_API_KEY`)
- Live rates as of integration: 8.29% regular APY, $19.4M TVL, 2.4% utilization

### @nanuqfi/backtest (historical simulation engine)
- `runBacktest` — day-by-day scoring simulation across Kamino/Marginfi/Lulo
- `fetchHistoricalData` — 21K+ Kamino historical data points with protocol estimates
- `computeMetrics` — CAGR, Sharpe ratio, Sortino ratio, max drawdown, volatility
- Proves router outperforms any single protocol over 2.5 years of data

### Allocator Program (Anchor/Rust)
21 instructions: initialize_allocator, initialize_risk_vault, initialize_treasury, deposit, request_withdraw, withdraw, rebalance, emergency_halt, resume, update_keeper_authority, update_guardrails, acquire_lease, heartbeat, withdraw_treasury, allocate_to_protocol, recall_from_protocol, update_deposit_cap, update_treasury_usdc, admin_reset_vault, admin_set_redemption_period, admin_set_rebalance_counter

**Trust model:** Users trust the on-chain program (auditable), not the keeper. Keeper proposes → algorithm validates → program enforces.

## Design Patterns (from SIP Protocol)

1. Interface-first + Registry + SmartRouter with circuit breaker
2. Capability descriptors, not conditionals
3. Risk levels as first-class enum (`conservative | moderate | aggressive`)
4. Mock implementations for every interface
5. Abstract base class for shared strategy logic
6. Metadata escape hatch (`Record<string, unknown>`)
