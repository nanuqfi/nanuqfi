# NanuqFi — Vault Strategy Design Spec

**Date:** 2026-03-15
**Author:** RECTOR
**Status:** Draft

---

## 1. Overview

NanuqFi is a protocol-agnostic, AI-powered yield routing layer for DeFi. Users deposit USDC, select a risk profile, and the protocol routes capital to the best risk-adjusted yield across multiple strategies — governed by on-chain guardrails and managed by an AI-enhanced keeper bot.

**Endgame:** Route capital across any yield source (perp funding, lending, LP, staking, insurance), any protocol (Drift, Mango, Marginfi, Kamino), any chain (Solana, Arbitrum, Hyperliquid).

**Phase 1 (Hackathon):** Multi-strategy yield stack on Drift Protocol (Approach 2). Foundation for Approach 3 (Adaptive Regime Strategy) post-hackathon.

**Hackathon:** Ranger Build-A-Bear — Main Track (up to $500K TVL seeding) + Drift Side Track (up to $100K). Deadline: April 6, 2026 23:59 UTC.

### Judging Criteria

- Strategy Quality & Edge (genuine alpha / defensible thesis)
- Risk Management (drawdown limits, liquidation protection)
- Technical Implementation (code quality, vault architecture)
- Production Viability (scalability, deployment feasibility)
- Novelty & Innovation (new primitives, creative combinations)

### Submission Requirements

1. Demo/pitch video (max 3 minutes)
2. Strategy documentation (thesis, mechanics, risk management)
3. Code repository
4. On-chain verification (wallet or vault address)

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      USERS                               │
│              deposit USDC, pick risk level                │
└────────────────────────┬─────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────┐
│                    FRONTEND                               │
│       nanuqfi/nanuqfi-app (Next.js, custom components)    │
│     deposit/withdraw, vault stats, transparency UI        │
└────────────────────────┬─────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────┐
│              ON-CHAIN ALLOCATOR                           │
│         nanuqfi/nanuqfi → programs/allocator/             │
│            (Custom Anchor Program)                        │
│                                                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐    │
│  │ Conservative│ │  Moderate   │ │   Aggressive    │    │
│  │   Vault     │ │   Vault     │ │     Vault       │    │
│  │             │ │             │ │                 │    │
│  │ Lending +   │ │ Lending +   │ │ All sources +   │    │
│  │ Insurance   │ │ Basis +     │ │ directional     │    │
│  │ Fund        │ │ Insurance   │ │ funding bets    │    │
│  └──────┬──────┘ └──────┬──────┘ └───────┬─────────┘    │
│         │               │               │              │
│  ┌──────▼───────────────▼───────────────▼──────────┐   │
│  │         DRIFT PROTOCOL (CPI calls)              │   │
│  │    perps · spot · borrow/lend · insurance fund  │   │
│  └─────────────────────────────────────────────────┘   │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────┐
│                    AI KEEPER                              │
│         nanuqfi/nanuqfi-keeper (TypeScript)               │
│                                                          │
│  Layer 1: Algorithm Engine (every 5-15 min)              │
│    - Fetch rates, compute risk-adjusted scores           │
│    - Check auto-exit triggers                            │
│    - Propose weight adjustments                          │
│                                                          │
│  Layer 2: AI Reasoning (every 1-4h or on triggers)       │
│    - Market regime assessment (Claude API)                │
│    - Funding rate sustainability analysis                │
│    - Anomaly detection                                   │
│                                                          │
│  Layer 0: Health & Monitoring                            │
│    - Heartbeat, alerting, decision logging               │
│    - REST API for dashboard transparency                 │
└──────────────────────────────────────────────────────────┘
```

### Trust Model

Users trust the on-chain program (auditable, immutable), not the keeper. The keeper proposes rebalances; the program validates against guardrails. Three layers of protection: AI proposes → algorithm validates → program enforces.

---

## 3. Multi-Repo Structure

GitHub org: `github.com/nanuqfi/`

| Repo | Purpose | Deploy target |
|---|---|---|
| `nanuqfi/nanuqfi` | Core monorepo — SDK packages + Anchor program | npm publish |
| `nanuqfi/nanuqfi-app` | Frontend dashboard | Vercel |
| `nanuqfi/nanuqfi-keeper` | AI keeper bot | VPS (Docker) |
| `nanuqfi/nanuqfi-website` | Marketing site + brand guidelines | Vercel (future) |
| `nanuqfi/.github` | Org profile | — |

### Core Monorepo (`nanuqfi/nanuqfi`)

```
nanuqfi/
  packages/
    core/              → @nanuqfi/core
    │                    Interfaces, types, base classes, registry,
    │                    router, risk levels. ZERO protocol deps.
    │
    backend-drift/     → @nanuqfi/backend-drift
    │                    All Drift yield backends.
    │                    Depends on: @nanuqfi/core + @drift-labs/sdk
    │
    backend-mango/     → @nanuqfi/backend-mango (future)
    backend-marginfi/  → @nanuqfi/backend-marginfi (future)
    backend-kamino/    → @nanuqfi/backend-kamino (future)
    │
  programs/
    allocator/         → Anchor program (Rust)
  │
  package.json         → pnpm workspace root
  turbo.json           → Turborepo config
```

### Dependency Flow

```
@nanuqfi/core              ← zero external deps (pure interfaces)
     ▲
     │
     ├── @nanuqfi/backend-drift    ← depends on @drift-labs/sdk
     ├── @nanuqfi/backend-mango    ← depends on @mango-markets/client (future)
     │
     ├── nanuqfi-app (npm install @nanuqfi/core @nanuqfi/backend-drift)
     └── nanuqfi-keeper (npm install @nanuqfi/core @nanuqfi/backend-drift)
```

Everything points up to `core`. No cross-dependencies between backends.

---

## 4. On-Chain Allocator Program

Custom Anchor program — the core differentiator. Enforces risk guardrails on-chain; keeper proposes, program decides.

### Drift Integration Model

NanuqFi creates its OWN Drift vaults (one per risk tier) via Drift's Vault program, acting as vault manager. The allocator program is the authority over these sub-accounts.

- `Allocator PDA` is the vault manager for all three Drift vaults
- The keeper is set as the **trading delegate** on each Drift vault (can place/cancel orders, cannot withdraw)
- CPI flow: Allocator → Drift Vaults program → Drift Protocol (perps, spot, borrow/lend)
- Drift account requirements per trade (User, SpotMarket, PerpMarket, Oracle, etc.) are handled by the backend-drift SDK package, which constructs the full account list for each CPI

### Accounts

| Account | PDA Seeds | Purpose |
|---|---|---|
| `Allocator` | `["allocator"]` (singleton) | Global config: admin, keeper_authority, risk tiers, guardrail params, total TVL, halted flag |
| `RiskVault` | `["vault", risk_level]` where risk_level is u8 (0=conservative, 1=moderate, 2=aggressive) | Per-tier: Drift vault pubkey, strategy mandate, allocation caps, drawdown snapshot |
| `UserPosition` | `["position", user_pubkey, risk_level]` | Per-user per-tier: share balance, deposit amount, entry slot, pending withdrawal |
| `RebalanceRecord` | `["rebalance", vault_pubkey, counter]` (counter stored in RiskVault, increments per rebalance) | Audit log: previous/new weights, AI reasoning hash, timestamp, approval status. Capped at 256 per vault (circular buffer) |
| `KeeperLease` | `["lease"]` (singleton) | Mutex: keeper pubkey, lease expiry slot, heartbeat slot |

Users CAN hold positions in multiple risk tiers simultaneously (separate UserPosition per tier).

### Share Token & Fee Mechanics

**Share pricing:** ERC-4626 style. `share_price = total_vault_assets / total_shares`. On deposit, user receives `deposit_amount / share_price` shares. On withdrawal, user receives `shares * share_price` USDC.

**Share token:** SPL Token (standard). Each risk tier mints its own share token from a mint PDA `["share_mint", risk_level]`. Transferable — enables secondary market composability.

**Fee structure:**

| Fee | Value | When collected | Recipient |
|---|---|---|---|
| Management fee | 1% annualized | Accrued per-epoch, deducted from vault NAV before share price calculation | Treasury PDA `["treasury"]` |
| Performance fee | 10% of profits | Collected on withdrawal, only on gains above high-water mark per user | Treasury PDA |
| Withdrawal fee | None | — | — |
| Deposit fee | None | — | — |

High-water mark is stored per UserPosition. Performance fee only applies to gains above the user's previous peak share price. This prevents double-charging after a drawdown-recovery cycle.

Treasury PDA is controlled by admin (RECTOR initially). Future: governance multisig.

### Withdrawal Flow

Two-phase withdrawal (no instant withdrawals — protects against bank runs and front-running):

1. User calls `request_withdraw(shares)` → sets `pending_withdrawal` and `withdraw_request_slot` on UserPosition
2. Wait redemption period (configurable per tier, stored in RiskVault):
   - Conservative: 1 day (minimum for Drift vault withdrawal)
   - Moderate: 2 days
   - Aggressive: 3 days
3. After redemption period, user calls `withdraw()` → burns shares at current share price (uses worse of request-time vs current price to protect remaining depositors), CPI withdraws from Drift vault, transfers USDC to user
4. During emergency halt: pending redemptions are accelerated (redemption period waived), but new `request_withdraw` calls still allowed. No instant withdrawals even during halt — keeper must unwind positions first.

The `withdraw` instruction (without prior `request_withdraw`) does NOT exist. All withdrawals go through the two-phase flow.

### Keeper Authentication

- `keeper_authority` pubkey stored in `Allocator` account. Only this signer can call `rebalance`
- Admin can rotate keeper key via `update_keeper_authority` instruction (takes effect immediately, old key invalidated)
- During rotation: brief gap is acceptable — positions hold, no rebalance occurs. Keeper restart with new key resumes normal operation
- KeeperLease PDA: keeper writes `["lease"]` with its pubkey + expiry slot (current_slot + 2 * cycle_slots). Renewed each heartbeat. Second instance checks lease → if not expired and different pubkey → refuses to act. Orphaned lease expires naturally after 2 missed cycles

### Instructions

| Instruction | Caller | Purpose |
|---|---|---|
| `initialize_allocator` | Admin | Set up global config, risk tiers, initial guardrails, keeper_authority |
| `initialize_risk_vault` | Admin | Create a risk tier vault, link to Drift vault, set caps and redemption period |
| `deposit` | User | Accept USDC, compute share price, mint shares, CPI deposit into Drift vault |
| `request_withdraw` | User | Lock shares for withdrawal, record request slot, start redemption countdown |
| `withdraw` | User | After redemption period: burn shares, compute USDC at worse-of price, deduct performance fee, CPI withdraw from Drift vault, transfer USDC |
| `rebalance` | Keeper (keeper_authority) | Propose new weights + drawdown snapshot. Program validates against guardrails |
| `update_guardrails` | Admin | Timelocked param changes (24h delay). Can only tighten, never loosen beyond init |
| `update_keeper_authority` | Admin | Rotate keeper key |
| `emergency_halt` | Admin | Set halted=true. Freeze new deposits. Accelerate pending redemptions. Keeper can only reduce positions |
| `resume` | Admin | Unset halted flag. Requires all risk metrics within bounds |

### Drawdown Tracking

On-chain drawdown tracking uses **keeper-submitted snapshots with oracle verification**:

1. Every `rebalance` call includes a `drawdown_snapshot`: current vault equity computed by the keeper
2. The program verifies this against Drift's oracle prices (available via CPI to Pyth) — if keeper-submitted equity diverges >1% from oracle-derived estimate, the rebalance is rejected
3. Program stores `peak_equity` (high-water mark) and `current_equity` per RiskVault. Drawdown = `(peak - current) / peak`
4. If drawdown exceeds tier max → program rejects the rebalance AND sets the vault to reduce-only mode
5. For the 24h TVL emergency halt: program stores `equity_24h_ago` (updated once per epoch by the keeper, oracle-verified). If `current / equity_24h_ago < 0.85` → auto-halt

This is a hybrid model: keeper computes, oracle verifies, program enforces. The keeper cannot lie about drawdown because the program cross-checks against Pyth oracle prices.

### On-Chain Guardrails

```
Conservative vault:
  - max 100% lending + insurance fund
  - max 0% perp exposure
  - max drawdown: 2%
  - redemption period: 1 day

Moderate vault:
  - max 60% basis trade
  - max 40% lending/insurance
  - max 20% single-asset concentration (applies per-asset within strategies,
    e.g., SOL basis + SOL funding combined cannot exceed 20% of vault)
  - max drawdown: 5%
  - redemption period: 2 days

Aggressive vault:
  - max 70% perp strategies
  - max 30% lending/insurance
  - max 3x leverage
  - max drawdown: 10%
  - redemption period: 3 days

Global:
  - min rebalance interval: 1 hour
  - max allocation shift per rebalance: 20%
  - emergency halt if total TVL drops >15% in 24h (oracle-verified)
```

---

## 5. Yield Sources & Strategy Logic

### Yield Source Breakdown

| Source | Mechanism | Expected APY | Risk |
|---|---|---|---|
| USDC Lending | Drift borrow/lend market | 5-12% | Low |
| Insurance Fund Staking | Drift insurance fund (liquidation fees + protocol revenue) | 8-15% | Low-Medium |
| Basis Trade | Long spot (SOL/BTC/ETH) + short perp. Delta-neutral. Collect funding spread | 15-40% | Medium |
| Funding Rate Capture | Directional perp when funding is extreme | 20-50% | High |
| JitoSOL Delta-Neutral | JitoSOL (staking ~7%) + short SOL perp (hedge + funding) | 20-35% | Medium |

**Note on JitoSOL Delta-Neutral:** Acquiring JitoSOL requires CPI into Jito's staking program, not Drift. This makes it the only Phase 1 strategy that touches a non-Drift protocol. Options:
- **(Preferred) Keeper acquires JitoSOL off-chain** before depositing into the Drift spot account. The allocator program only sees JitoSOL as a Drift spot position. Trade-off: the acquisition step is off-chain (trust keeper for the swap), but position management is still on-chain.
- **(Alternative) Defer to Phase 2** if the off-chain acquisition step feels like a trust model violation. Replace with a simpler lending-heavy strategy for Moderate vault in Phase 1.

Decision: use the preferred approach (keeper acquires JitoSOL). The swap is a simple Jupiter route — low risk, auditable on-chain, and the actual position (JitoSOL + short perp) is fully managed by the allocator.

### Vault-to-Source Mapping

- **Conservative:** Lending + Insurance Fund only (8-15% APY)
- **Moderate:** Lending + Insurance + Basis Trade + JitoSOL DN (15-25% APY)
- **Aggressive:** All sources including directional funding capture (20-40% APY)

### Auto-Exit Triggers

| Strategy | Exit condition |
|---|---|
| Basis trade | Funding flips negative >4h continuously |
| Funding capture | Position PnL hits -2% (Aggressive: -5%) |
| JitoSOL DN | SOL borrow rate exceeds staking yield |
| Insurance fund | Drift insurance fund drawdown >30% |

### Rebalance Cycle

1. Keeper reads current state (positions, funding rates, lending APY, insurance yield)
2. Algorithm engine scores each source: `risk_adjusted_return = expected_apy / volatility_score` where `volatility_score` is the standard deviation of hourly returns over a 7-day lookback window, normalized to [0,1]. Detailed scoring formula to be specified during keeper implementation — this is the core alpha logic
3. AI layer (on trigger) analyzes: funding sustainability, protocol risk signals, regime shift
4. Keeper proposes new weights to allocator
5. On-chain program validates against guardrails → executes or rejects

---

## 6. AI Keeper Architecture

### Two-Layer Design

**Layer 1: Algorithm Engine** (runs every 5-15 minutes)
- Fetch funding rates, lending APY, insurance fund yield from Drift
- Compute risk-adjusted scores per yield source
- Check auto-exit triggers
- Propose weight adjustments
- Execute rebalance tx if within guardrail bounds

**Layer 2: AI Reasoning** (runs every 1-4h or on event triggers)
- Market regime assessment via Claude API
- Funding rate trend sustainability analysis
- Protocol risk signals (Drift health, oracle deviations, liquidation spikes)
- Weight optimization beyond algorithmic rules
- Anomaly detection

**Layer 0: Health & Monitoring** (always-on)
- Heartbeat / self-check
- Alert on missed cycles
- Log all decisions + reasoning
- REST API for dashboard transparency

### AI Layer Contract

AI is ADVISORY only. It can: suggest weight changes, flag anomalies, provide reasoning for logs. It CANNOT: execute transactions directly, override algorithm engine vetoes, bypass on-chain guardrails.

### Event Triggers for AI Layer

- Funding rate spike >2x rolling average
- Drawdown exceeds 50% of tier max
- Liquidation volume spike on Drift
- Oracle deviation >2%

### Decision Flow

```
AI recommends weights
        │
        ▼
Algorithm engine validates
(mathematical sanity check against live data)
        │
        ▼
On-chain program validates
(guardrail enforcement)
        │
        ▼
Execute or reject
```

### Decision Logging

Every rebalance stores: timestamp, previous weights → new weights, algorithm scores, AI reasoning summary (if involved), guardrail check result, tx signature. Feeds into frontend transparency UI.

---

## 7. Keeper Hardening & Failure Modes

The AI keeper is the critical path. Every change touching keeper logic must consider failure modes.

### AI Layer Failures

| Failure | Mitigation |
|---|---|
| API timeout / down | Algorithm engine operates independently. AI is enhancer, never dependency. Conservative drift if AI unreachable |
| Malformed response | Strict schema validation. Parse fail → discard, log, alert, algo-only |
| Hallucinated weights | Math validation: sum check, range check, sanity against guardrails before algo engine evaluates |
| Confident but wrong | Algorithm cross-checks AI against live data. AI recommends basis when funding is negative → override + log |
| Rate limiting / cost | Hard rate limit per hour. Budget cap per day. Circuit breaker on spend. Degrade to algo-only |

### Drift / Solana Failures

| Failure | Mitigation |
|---|---|
| RPC down | Multi-RPC failover (Helius → Triton → public). Circuit breaker per provider |
| Tx failure | Retry with exponential backoff (max 3). Never retry partially succeeded tx |
| Solana congestion | Dynamic priority fees. 90s timeout → cancel, retry next cycle. Jito bundles for critical rebalances |
| State desync | Reconciliation on every cycle start. Read ALL on-chain state fresh. Never trust cached position state |
| Oracle deviation >2% | Halt new positions on that asset. Reduce-only mode. Alert immediately |

### Process Failures

| Failure | Mitigation |
|---|---|
| Process crash | Watchdog daemon. 2 missed heartbeats → restart. 3 failed restarts → emergency halt on-chain + alert |
| Memory leak | Hard RSS ceiling. Exceed → graceful restart after current cycle |
| Stuck in loop | 60s per-cycle timeout. Exceed → kill, log, fresh start next cycle |
| Duplicate instance | Mutex via on-chain lease PDA. Second instance reads lease → refuses to act |

### Economic Edge Cases

| Failure | Mitigation |
|---|---|
| Flash crash | Auto-exit on unrealized PnL, not time. Max drawdown → close immediately |
| Funding whipsaw | 4h consistent positive funding required before entry. No chasing noise |
| Liquidity crisis | Slippage tolerance per trade. >1% → reduce size. >3% → abort + alert |
| Correlated drawdown | On-chain circuit breaker: TVL drops >15% in 24h → emergency halt |
| Front-running | Jito bundles. Randomize rebalance timing. Split large rebalances |
| Bank run | Redemption period protects. Keeper prioritizes orderly position reduction |

### Cascading Failure Example

Solana congestion + funding flip + AI down:
1. AI unreachable → algo engine takes over
2. Funding flips negative → auto-exit trigger fires
3. Exit tx doesn't land → retry with priority fees
4. Still doesn't land → on-chain circuit breaker watches drawdown
5. Drawdown hits 15% → emergency halt activates
6. All vaults → withdraw-only
7. Alert fires

Every layer has independent protection. No single failure path can drain vaults.

### Boot Sequence

1. Verify RPC connectivity (primary + fallback)
2. Check lease PDA — am I the only keeper?
3. Reconcile: read all on-chain state, compare to expected
4. If mismatch → log, resolve, don't proceed until clean
5. Check pending withdrawals → prioritize if any
6. Run algorithm engine cycle
7. If AI trigger conditions met → call AI layer
8. Propose rebalance (if needed)
9. Write heartbeat
10. Sleep until next cycle

---

## 8. SDK & Interface Design

Protocol-agnostic foundation. Interfaces designed so adding new yield sources is just implementing a backend.

### Core Interfaces

```typescript
interface YieldBackend {
  readonly name: string
  readonly capabilities: BackendCapabilities

  getExpectedYield(): Promise<YieldEstimate>
  getRisk(): Promise<RiskMetrics>
  deposit(amount: BN, params?: Record<string, unknown>): Promise<TxSignature>
  withdraw(amount: BN): Promise<TxSignature>
  getPosition(): Promise<PositionState>
}

interface BackendCapabilities {
  supportedAssets: Asset[]
  supportsLeverage: boolean
  maxLeverage: number
  isDeltaNeutral: boolean
  hasAutoExit: boolean
  liquidationRisk: 'none' | 'low' | 'medium' | 'high'
  minDeposit: BN              // minimum position size (Drift market minimums)
  maxDeposit: BN              // maximum position size
  withdrawalDelay: number     // lock-up period in seconds (0 = instant)
  estimatedSlippage(amount: BN): Promise<number>  // basis points, for position sizing
  features?: string[]         // metadata escape hatch
}

type RiskLevel = 'conservative' | 'moderate' | 'aggressive'
```

### Design Patterns (from SIP Protocol)

1. **Interface-first + Registry + Router** — YieldBackendRegistry stores backends. YieldRouter queries all, ranks by risk-adjusted yield, with circuit breaker protection
2. **Capability descriptors, not conditionals** — Backends declare what they support. Router queries capabilities, never checks backend names
3. **Risk levels as first-class enum** — Flows from user selection → allocator → strategy → keeper
4. **Mock implementations for every interface** — Full test coverage without live networks
5. **Abstract base class** — BaseVaultStrategy handles shared logic (fee accounting, position tracking, events). Specific strategies extend it
6. **Metadata escape hatch** — `Record<string, unknown>` on every param/result for backend-specific data

### Phase 1 Backends

- DriftLendingBackend (USDC lending)
- DriftInsuranceBackend (insurance fund staking)
- DriftBasisTradeBackend (spot + perp hedge)
- DriftFundingBackend (directional funding capture)
- DriftJitoDNBackend (JitoSOL delta-neutral)

### Future Backends (just implement YieldBackend)

- MangoLendingBackend, MarginfiLendingBackend, KaminoLPBackend, HyperliquidFundingBackend

---

## 9. Frontend & Transparency UX

Custom components, brand guidelines-driven. No off-the-shelf UI kits.

### Prerequisites

Brand guidelines must exist before any UI work begins. Covers: colors, typography, spacing, motion language, component design system, tone.

### Pages

| Page | Purpose |
|---|---|
| Dashboard | Portfolio overview: total deposited, current APY, PnL chart, risk tier breakdown |
| Vaults | Three risk tier cards with live stats. Deposit/withdraw |
| Vault Detail | Deep dive — allocation breakdown, guardrails, keeper decisions, rebalance history |
| Activity | Rebalance history, withdrawal status, fee accounting |

### Transparency Layer (Vault Detail)

Each risk tier shows:
- Current allocation breakdown (% per yield source with individual APY)
- Active positions and status
- On-chain guardrail usage vs maximums (visual progress bars)
- Last keeper decision: what changed, why, was AI involved, guardrail check result, tx signature
- Full rebalance history with reasoning

### UX Standards

- Custom components only — zero off-the-shelf UI libraries
- Every interaction intentional — micro-interactions, data visualization, progressive disclosure
- Brand guidelines as source of truth for all visual decisions
- Wallet-standard connection (Solana wallet adapter)

---

## 10. Testing Strategy

### Per-Package Testing

| Package | Type | Coverage target |
|---|---|---|
| `core/` | Unit | 80%+ |
| `backend-drift/` | Unit + Integration | 90%+ |
| `keeper/` | Unit + Integration | 90%+ |
| `programs/allocator/` | Anchor tests | 90%+ |
| `app/` | E2E (Playwright) | Critical paths |

### Non-Hanging Test Rules

- Every async test has explicit timeout (5s unit, 30s integration)
- Every test has setup/teardown — close connections, clear listeners, AbortController
- Network calls wrapped with `withTimeout()` — devnet slow = test FAILS, never hangs
- Unit tests (`pnpm test`) run offline with mocks only
- Integration tests (`pnpm test:int`) run on PR only, not blocking local dev

### Mock Implementations

- MockDriftLendingBackend — deterministic APY, configurable failure modes
- MockDriftBasisBackend — simulated funding rate curves
- MockDriftInsuranceBackend — fixed yield, drawdown simulation
- MockYieldRouter — predictable ranking, testable circuit breaker
- MockAllocatorProgram — in-memory guardrail validation
- MockAIProvider — canned responses, timeout simulation, hallucination injection
- MockRPCProvider — controlled Solana state, failure injection

### Critical Test Scenarios

- AI returns garbage → keeper discards, falls back to algo-only
- AI API timeout → algo engine continues, no delay
- Funding rate flips mid-cycle → auto-exit fires within same cycle
- RPC primary down → failover within 2s
- Two keeper instances → second refuses via lease PDA
- TVL drops 16% in 24h → emergency halt activates
- Rebalance exceeds 20% shift → program rejects

### CI Pipeline

```
pnpm turbo test        → unit tests (every push)
pnpm turbo test:int    → integration tests (PR only)
anchor test            → allocator program tests (integrated into Turborepo pipeline via turbo.json)
pnpm turbo lint        → eslint + clippy
```

Anchor tests run as part of the Turborepo pipeline. The `programs/allocator/` package has a `test` script that runs `anchor test` with localnet. CI builds the program, deploys to localnet, and runs all Anchor tests.

---

## 11. Tech Stack

| Layer | Technology |
|---|---|
| On-chain program | Rust, Anchor framework |
| SDK / Core | TypeScript strict mode, 2-space indent |
| Keeper | TypeScript, Drift SDK, Claude API |
| Frontend | Next.js (App Router), React, Tailwind, custom components |
| Monorepo | pnpm workspaces + Turborepo |
| Testing | Vitest (TS), Anchor test framework (Rust), Playwright (E2E) |
| CI/CD | GitHub Actions |
| Keeper deploy | Docker, VPS |
| Frontend deploy | Vercel |

---

## 12. Evolution Roadmap

### Hackathon → Endgame

| Dimension | Hackathon (Phase 1) | Endgame |
|---|---|---|
| Strategy | Approach 2: Multi-strategy yield stack | Approach 3: Adaptive regime strategy |
| Protocols | Drift only | Any protocol (Mango, Marginfi, Kamino, cross-chain) |
| Yield sources | Lending, insurance, basis, funding, JitoSOL DN | + LP, staking, cross-chain yield |
| Chain | Solana only | Multi-chain (Solana, Arbitrum, Hyperliquid) |
| Asset | USDC only | Multi-asset vaults |
| AI keeper | Cloud API (Claude) for reasoning | + Custom ML models for alpha (open nuance) |
| Allocator | Drift-specific on-chain | Multi-protocol allocator |

### Open Nuance

Custom ML models trained on historical market data for alpha generation. Currently deferred — using cloud AI APIs. Architecture will not preclude adding a Python ML microservice later.

---

## 13. Keeper REST API

The keeper exposes a REST API for the frontend transparency layer.

### Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `GET /health` | GET | Heartbeat, uptime, last cycle timestamp |
| `GET /vaults` | GET | All vault states: TVL, APY, allocation weights, drawdown |
| `GET /vaults/:riskLevel` | GET | Single vault detail with full position breakdown |
| `GET /vaults/:riskLevel/history` | GET | Rebalance history with reasoning (paginated) |
| `GET /vaults/:riskLevel/decisions` | GET | Last N keeper decisions: algo scores, AI reasoning, guardrail checks |
| `GET /yields` | GET | Current yield estimates per source (funding rates, lending APY, etc.) |
| `GET /status` | GET | Keeper status: current cycle, AI layer status, RPC health, lease info |

All endpoints are read-only. No write operations via REST — all actions go through on-chain instructions.

Authentication: none required for read-only public data. Future: API key for rate limiting if needed.

---

## 14. Program Upgrade Strategy

- Anchor program uses `declare_id!` with a fixed program ID
- Upgrade authority: admin keypair (RECTOR initially). Future: multisig via Squads
- Account migrations for schema changes use Anchor's `#[account]` versioning — new fields added with defaults, old accounts migrated lazily on first access
- Before any upgrade: deploy to devnet, run full Anchor test suite, verify account compatibility
- Emergency upgrades (critical bug): admin can upgrade immediately. Non-emergency: 24h notice period (social contract, not enforced on-chain)

---

## 15. Monitoring & Alerting

| Channel | Purpose |
|---|---|
| **Telegram bot** | Primary alert channel — emergency halts, drawdown warnings, keeper crashes, RPC failovers. RECTOR checks this |
| **Keeper logs** (stdout/Docker) | Full operational logs — every cycle, every decision, every error. Structured JSON for parsing |
| **REST API `/health`** | External uptime monitoring (UptimeRobot or similar) |

Alert severity levels:
- **CRITICAL** (Telegram immediate): emergency halt triggered, keeper crash after 2 restarts, drawdown >80% of max
- **WARNING** (Telegram batched): RPC failover, AI layer unreachable, single strategy auto-exit, funding rate flip
- **INFO** (logs only): normal rebalances, AI reasoning summaries, heartbeats

---

## 16. Brand

- **Name:** NANUQFI (nanuq = Inuit for polar bear + fi = finance)
- **Handles:** @nanuqfi, nanuqfi.com, github.com/nanuqfi
- **Brand guidelines:** To be created before frontend work begins
