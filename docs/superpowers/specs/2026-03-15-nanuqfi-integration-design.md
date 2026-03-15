# NanuqFi — Integration & Deployment Design Spec

**Date:** 2026-03-15
**Author:** RECTOR
**Status:** Draft (post-review revision)
**Prerequisite:** All 5 build phases complete (211 tests). See `2026-03-15-nanuqfi-vault-strategy-design.md` for foundation spec.
**Supersedes:** Foundation spec Section 3 re: frontend deploy target (VPS, not Vercel).

---

## 1. Overview

This spec covers the integration and deployment phase — wiring the existing NanuqFi components to real Drift Protocol infrastructure, deploying to devnet then mainnet, and preparing the hackathon submission.

**Goal:** Full execution pipeline — real deposits, real Drift positions, real withdrawals. Devnet first (verify CPIs), mainnet with tight caps (build track record).

**Hackathon scope:** 2 vaults (moderate + aggressive), 4 strategies (lending, basis trade, funding capture, JitoSOL DN). Conservative vault and DriftInsuranceBackend excluded — insurance pools disqualified by Ranger Build-A-Bear rules. Both remain in codebase for post-hackathon activation.

**Timeline (hybrid approach):**

| Phase | Days | Focus |
|---|---|---|
| Foundation | 1-2 | DriftClient setup, deploy infra, allocator to devnet |
| Vertical proof | 3-7 | Lending end-to-end on devnet |
| Strategy expansion | 8-14 | Basis + Funding + JitoSOL DN, full keeper with AI |
| Mainnet + submission | 15-21 | Mainnet deploy, real trades, demo video, strategy docs |

---

## 2. Drift SDK Connection Layer

Shared `DriftClient` wrapper used by all backends and the keeper. Single connection, not one per backend.

### Connection Architecture

```
packages/backend-drift/src/drift-connection.ts  (replaces current placeholder)
```

- `createDriftConnection(config)` → returns initialized, subscribed `DriftClient`
- Config interface EXPANSION (current has only `rpcUrl`, `walletKeypairPath`, `env`):

```typescript
export interface DriftConnectionConfig {
  rpcUrl: string
  rpcFallbackUrl?: string           // NEW — fallback RPC
  walletKeypairPath: string
  env?: 'devnet' | 'mainnet-beta'
  commitment?: Commitment            // NEW — default 'confirmed'
}
```

- Injected into backends via constructor — config type expansion:

```typescript
// Each backend config gains driftClient alongside existing fields:
constructor(config: DriftLendingConfig & { driftClient?: DriftClient })
```

- When `mockMode: false` + `driftClient` provided → real mode
- When `mockMode: true` → existing mock behavior (all 211 tests stay green)

### BN/bigint Boundary

Backend interfaces use `bigint` (per `@nanuqfi/core`). Drift SDK uses `BN` (from `@coral-xyz/anchor`). Conversion happens inside each backend method — backends accept `bigint`, internally convert to `BN` for Drift SDK calls, convert results back to `bigint` for return values. The conversion boundary is INSIDE the backend, invisible to consumers.

### Account Subscription

- Subscribe to all spot markets (lending rates, borrow rates)
- Subscribe to all perp markets (funding rates)
- Subscribe to user accounts (position tracking)
- WebSocket subscription (not polling) — lower latency for keeper

### Connection Resilience

| Concern | Handling |
|---|---|
| RPC failover | Primary → fallback (configurable list). 3 consecutive failures → circuit breaker opens → switch. Half-open probe every 60s |
| WebSocket disconnect | Exponential backoff reconnect (1s, 2s, 4s, max 30s). Re-subscribe all accounts. Keeper pauses until subscription healthy |
| Subscription health | Before every keeper cycle: verify `driftClient.isSubscribed`. If false → reconnect before proceeding. Never operate on stale data |
| Transaction retry | Exponential backoff (max 3 attempts). Never retry partially succeeded tx. Persistent failure → log, alert, skip cycle |
| Rate limiting | Track RPC calls/second. Back off when approaching provider limits |
| Total outage | Keeper enters observation-only mode — no rebalances, heartbeat writes, alerts fire. Never make decisions without fresh state |

---

## 3. Backend Real Mode Implementation

Each of the 4 hackathon backends switches from mock to real Drift SDK calls. Dual mode preserved — mock path untouched.

### DriftLendingBackend

| Method | Real Implementation |
|---|---|
| `deposit(amount)` | `driftClient.deposit(amount, marketIndex=0, ata)` — USDC = spot market 0 |
| `withdraw(amount)` | `driftClient.withdraw(amount, marketIndex=0, ata)` |
| `getExpectedYield()` | Drift Data API: `GET /rateHistory?marketIndex=0&type=deposit` |
| `getRisk()` | Low static risk. Volatility from rate history variance |
| `getPosition()` | `driftClient.getUser().getSpotPosition(0)` → map to PositionState |
| `estimateSlippage()` | Near-zero (spot deposit) |

### DriftBasisTradeBackend

| Method | Real Implementation |
|---|---|
| `deposit(amount)` | Deposit USDC collateral + `placeAndTakePerpOrder()` (short). Two operations, must both succeed |
| `withdraw(amount)` | Close perp position + withdraw collateral. Both must succeed |
| `getExpectedYield()` | Funding rate from Data API, annualized: `rate × 24 × 365` |
| `shouldAutoExit()` | Existing logic fed REAL funding history from Data API |
| `getPosition()` | Read spot position (collateral) + perp position (short), combine |

### DriftFundingBackend

| Method | Real Implementation |
|---|---|
| `deposit(amount)` | Deposit USDC collateral + open perp (directional, based on funding direction) |
| `withdraw(amount)` | Close perp + withdraw collateral |
| `getExpectedYield()` | Real funding rates from Data API |
| `shouldAutoExit()` | Real unrealized PnL from `getUser().getPerpPosition().getUnrealizedPnl()` |

### DriftJitoDNBackend

| Method | Real Implementation |
|---|---|
| `deposit(amount)` | Jupiter swap USDC → JitoSOL, deposit JitoSOL to Drift spot, open SOL perp short hedge |
| `withdraw(amount)` | Close perp short, withdraw JitoSOL, Jupiter swap back to USDC |
| `getExpectedYield()` | JitoSOL staking yield (Jito API) minus SOL borrow rate (Drift Data API) |
| `shouldAutoExit()` | Existing logic with real rates |

### Atomic Transaction Handling (Basis + Funding + JitoSOL DN)

Strategies with paired positions (collateral + perp):

1. Simulate both legs before sending
2. If second leg fails after first succeeds → unwind first leg immediately
3. If unwind also fails → log CRITICAL, alert, keeper flags position as "orphaned"
4. Never leave orphaned positions — next cycle detects and cleans up
5. No partial execution tolerance — both legs or neither

### New Dependency: Jupiter SDK

Used only by DriftJitoDNBackend for USDC ↔ JitoSOL swaps.

- Keeper calls Jupiter API for optimal route
- Builds swap tx, signs, sends
- If Jupiter down → skip JitoSOL DN strategy for this cycle, alert. Other 3 strategies continue

---

## 4. Allocator Program — Drift CPI Integration

### Current Code vs Spec Gap

The existing allocator program does NOT CPI into Drift. It holds USDC in its own `vault_usdc` TokenAccount:
- `deposit()` transfers USDC from user → `vault_usdc` (allocator PDA owns it)
- `withdraw()` transfers USDC from `vault_usdc` → user

This was built during Phase 2 as accounting scaffolding. The integration phase adds the Drift CPI layer.

### Revised CPI Architecture (Keeper-Mediated Model)

```
User → Allocator::deposit()           → USDC to vault_usdc, mint shares (EXISTING)
User → Allocator::withdraw()          → USDC from vault_usdc to user, burn shares (EXISTING)
Keeper → Allocator::allocate_to_drift() → CPI: vault_usdc → Drift Vault (NEW)
Keeper → Allocator::recall_from_drift() → CPI: Drift Vault → vault_usdc (NEW)
Keeper → Allocator::rebalance()        → validate guardrails, update weights (EXISTING)
```

**Why keeper-mediated, not direct CPI on deposit:**
- Allocator can't know optimal Drift allocation at deposit time (needs keeper analysis)
- Keeper decides HOW MUCH to put in Drift vs hold as liquid USDC (for pending withdrawals)
- Funds always flow through the allocator program — keeper cannot withdraw to its own wallet
- Trust model preserved: allocator holds funds trustlessly, keeper can only trade (not extract)

### New Instructions

**`allocate_to_drift(amount: u64)`** — NEW
- Caller: keeper (keeper_authority signer)
- Transfers USDC from vault_usdc → Drift vault via CPI to Drift Vault program
- Allocator PDA signs as vault manager
- Validates: not halted, amount ≤ vault_usdc balance, keeper is authorized

**`recall_from_drift(amount: u64)`** — NEW
- Caller: keeper (keeper_authority signer)
- CPI to Drift Vault program: withdraw USDC from Drift vault → vault_usdc
- Allocator PDA signs as vault manager
- Used when: pending withdrawals need liquidity, strategy unwinding, rebalancing

### Drift Vault Setup (One-Time Per Risk Tier)

- Create Drift vault via Drift Vault program, Allocator PDA as vault manager
- Set keeper wallet as trading delegate on each vault
- 2 vaults for hackathon: moderate (risk_level=1), aggressive (risk_level=2)
- Vault creation via setup script/CLI, not through allocator program

### CPI Account Requirements

Both new instructions need these Drift accounts (added to account structs):

```
Drift Vault (from RiskVault.drift_vault)
Drift Vault USDC token account
Drift State
Drift Spot Market (USDC, index 0)
Drift Oracle
Drift Vault Program (program ID)
```

### Transaction Size

- Drift CPI adds ~10 accounts to each instruction
- Solana tx limit: 1232 bytes
- Mitigation: Address Lookup Tables (ALTs). Drift provides standard ALTs
- If still tight: ALT setup tx (once per vault) + operation tx
- Verified on devnet with exact account list before mainnet

### Compute Budget

- Set explicit compute unit limit (2x measured + buffer)
- Measured on devnet during integration testing
- Default 200K may not be enough for CPI chains

### Burn Authority Fix

Current code bug: `withdraw()` burns shares using allocator PDA as authority, but user owns the share token account. SPL Token burn requires the account owner or an approved delegate.

**Fix:** Change burn authority from allocator PDA to user (who is already a signer on the withdraw tx):

```rust
// BEFORE (buggy):
token::burn(CpiContext::new_with_signer(..., Burn {
  authority: ctx.accounts.allocator.to_account_info(), // PDA - NOT the owner
}, signer_seeds), shares)?;

// AFTER (fixed):
token::burn(CpiContext::new(..., Burn {
  mint: ctx.accounts.share_mint.to_account_info(),
  from: ctx.accounts.user_shares.to_account_info(),
  authority: ctx.accounts.user.to_account_info(), // User signs the tx
}), shares)?;
```

### New Error Variants

Add to `errors.rs` for integration edge cases:

```rust
#[msg("Drift vault capacity exceeded")]
VaultCapacityExceeded,
#[msg("Oracle price data is stale")]
StaleOracle,
#[msg("Insufficient liquid USDC in vault for withdrawal")]
InsufficientLiquidity,
#[msg("Drift CPI failed")]
DriftCpiFailed,
#[msg("Deposit exceeds vault cap")]
DepositCapExceeded,
```

### Deposit Cap

Add `deposit_cap: u64` field to `RiskVault` struct. Checked in `deposit()` instruction:

```rust
require!(
  vault.total_assets.checked_add(amount).ok_or(...)? <= vault.deposit_cap,
  AllocatorError::DepositCapExceeded
);
```

Caps set during `initialize_risk_vault`. Admin can update via new `update_deposit_cap` instruction. Enables the tight cap progression (seed → limited → open).

### Guardrail Timelock

Foundation spec says "24h timelock on guardrail changes." Current code applies immediately. **Deferred to post-hackathon.** For now, `update_guardrails` applies immediately (tighten-only constraint still enforced). Noted as known gap — acceptable for hackathon where RECTOR is sole admin.

### Lease PDA Model

Code uses per-vault lease seeds: `["lease", risk_vault.key()]` — one lease per vault, not global singleton. The keeper must acquire and heartbeat a lease for EACH active vault (2 for hackathon). Foundation spec description of singleton lease is outdated.

### Share Price Accuracy

With keeper-mediated model, `total_assets` in RiskVault must reflect BOTH vault_usdc balance AND Drift position values. The keeper updates `total_assets` during rebalance via the `equity_snapshot` parameter (already oracle-verified by the rebalance instruction). Between rebalances, share price may lag slightly — acceptable for the 1-hour minimum rebalance interval.

### Rebalance Record Storage Cost

Each rebalance creates a new PDA account (~0.002 SOL rent). At 5-min cycles: ~105K accounts/year/vault = ~210 SOL/year. **Acceptable for hackathon.** Post-hackathon: migrate to circular buffer with `init_if_needed` (cap at 256 records, overwrite oldest).

### Deposit Edge Cases (User → vault_usdc)

| Edge Case | Mitigation |
|---|---|
| User USDC ATA doesn't exist | `init_if_needed` in instruction as defensive fallback |
| Insufficient USDC balance | Validate balance before transfer. Error: `InsufficientBalance` |
| Deposit exceeds vault cap | Check `total_assets + amount <= deposit_cap`. Error: `DepositCapExceeded` |
| Concurrent deposits (same slot) | Share price computed within instruction from on-chain state. Sequential execution — no stale price |
| Allocator halted | Existing check: `require!(!allocator.halted)`. Error: `AllocatorHalted` |

### Allocate-to-Drift CPI Edge Cases (vault_usdc → Drift Vault)

| Edge Case | Mitigation |
|---|---|
| CPI fails | Transaction reverts. vault_usdc balance unchanged. Keeper retries next cycle |
| Drift vault at capacity | Drift rejects CPI. Error: `VaultCapacityExceeded`. Keeper skips allocation, alerts |
| Drift vault paused by governance | CPI rejected. Keeper detects, sets vault status flag, alerts |
| Drift program upgraded | CPI fails with wrong accounts. Keeper detects, emergency halt, assess compatibility |
| Compute budget exceeded | Explicit budget from devnet measurements. 2x buffer |
| Keeper allocates more than available | On-chain check: `amount <= vault_usdc.amount`. Error: `InsufficientBalance` |

### Withdraw Edge Cases (vault_usdc → User)

| Edge Case | Mitigation |
|---|---|
| Insufficient liquid USDC in vault_usdc | Keeper must `recall_from_drift` before user can complete withdrawal. Error: `InsufficientLiquidity`. User retries. If persistent (24h+) → emergency halt |
| User USDC ATA closed | `init_if_needed` in withdraw instruction |
| Stale oracle during withdraw | Check oracle `last_update_slot`. Reject if stale > N slots. Error: `StaleOracle` |
| Performance fee overflow | Checked math (`checked_mul`, `checked_div`). Bounds check: fee > withdrawal = reject + alert |
| Emergency halt during withdrawal | Redemption period waived. Liquidity may be limited. Share price reflects real (lower) value |
| Mass withdrawal (bank run) | Redemption periods stagger outflow. Keeper prioritizes `recall_from_drift` to replenish vault_usdc |

### Recall-from-Drift CPI Edge Cases (Drift Vault → vault_usdc)

| Edge Case | Mitigation |
|---|---|
| Drift vault has insufficient liquid USDC | Funds locked in perp positions. Keeper must close positions first (as trading delegate), then recall. If positions can't be closed (market halted) → emergency halt + alert |
| CPI fails | Transaction reverts. Drift vault balance unchanged. Keeper retries with priority fees |
| Race condition: recall during Drift settlement | Use confirmed commitment. Verify Drift vault balance before CPI |

### Rebalance vs Withdrawal Timing

Keeper checks pending withdrawals before every cycle. If withdrawals maturing within 2 epochs → keeper calls `recall_from_drift` to ensure vault_usdc has sufficient liquidity. Only allocates surplus to Drift. On-chain `InsufficientLiquidity` rejection is the safety net if keeper gets it wrong.

---

## 5. Keeper — Real Drift Integration

Keeper switches from mock backends to real Drift data feeds and transaction submission.

### Connection Flow

```
Boot → createDriftConnection() → DriftClient
  → inject into 4 backends (mockMode: false)
  → subscribe to accounts
  → start cycle loop
```

### Data Feeds

| Data | Source | Method |
|---|---|---|
| USDC lending rate | Drift Data API | `GET /rateHistory?marketIndex=0&type=deposit` |
| SOL borrow rate | Drift Data API | `GET /rateHistory?marketIndex=1&type=borrow` |
| Funding rates | Drift Data API | `GET /fundingRates?marketName=SOL-PERP` |
| JitoSOL staking yield | Jito API | External HTTP call |
| Position state | DriftClient | `.getUser().getSpotPosition()` / `.getPerpPosition()` |
| Oracle prices | DriftClient | WebSocket subscription |

### Transaction Submission

Keeper acts as trading delegate — can place/cancel orders, cannot withdraw funds.

| Strategy | Keeper Action |
|---|---|
| Lending | No tx needed — funds earn yield passively in Drift spot |
| Basis trade | Open perp short via `placeAndTakePerpOrder()`, close on auto-exit |
| Funding capture | Open directional perp, close on PnL stop-loss |
| JitoSOL DN | Jupiter swap + Drift spot deposit + perp short hedge |

### Transaction Pipeline

1. Build transaction (order params, maker infos from DLOB server)
2. Simulate first (`connection.simulateTransaction`) — catch errors before spending SOL
3. Send with priority fees (`ComputeBudgetProgram.setComputeUnitPrice`)
4. Confirm (30s timeout)
5. Fail → retry with higher priority (max 3)
6. Still fails → skip, log, alert, next cycle
7. Never retry partially succeeded tx

### Updated Keeper Cycle (Real Mode)

1. Verify DriftClient subscription healthy
2. Check pending withdrawals → reserve liquidity
3. Reconcile on-chain state — NEVER trust cache
4. Fetch real rates (lending, funding, borrow, JitoSOL)
5. Feed into algorithm engine (scoring + auto-exit)
6. AI trigger check → call AI layer with real market context
7. Propose rebalance to allocator (if weights changed)
8. Execute strategy trades as trading delegate
9. Write heartbeat
10. Log everything for transparency UI

### Keeper Edge Cases

| Edge Case | Mitigation |
|---|---|
| Drift Data API down | Cache last-known rates (5 min TTL). Stale > 5 min → conservative weights, alert |
| DLOB server unreachable | Skip perp strategies this cycle. Lending unaffected |
| Jupiter API down | Skip JitoSOL DN. Other 3 continue |
| Perp order partially filled | Accept partial. Track actual size. Adjust next cycle |
| Funding changes between scoring and execution | Seconds of staleness — acceptable. Fresh check next cycle |
| Keeper wallet low on SOL | Health check every cycle. Alert at 0.05 SOL, CRITICAL at 0.01 |
| Trading delegate revoked | CPI fails → halt trading, alert. Admin must re-assign |
| Two keeper instances | Lease PDA mutex. Second instance refuses |

---

## 6. Frontend — Wallet Connect + Real Data

Frontend switches from mock data to real on-chain state and wallet interaction.

### Wallet Adapter

- `@solana/wallet-adapter-react` + `@solana/wallet-adapter-wallets`
- Supported: Phantom, Solflare, Backpack
- Context at layout level: `WalletProvider` + `ConnectionProvider`
- Configurable RPC (devnet → mainnet-beta)

### Data Sources

| Data | Source | Update |
|---|---|---|
| User USDC balance | On-chain (Token Program) | 15s poll |
| User share balances | On-chain (UserPosition PDA) | 15s poll |
| Vault TVL, share price | On-chain (RiskVault PDA) | 15s poll |
| Current APY, allocations | Keeper REST API | 30s poll |
| Decisions, history | Keeper REST API | 30s poll |
| Keeper health | Keeper REST API | 30s poll |

Hybrid model: on-chain for trustless data (balances, shares, TVL), keeper API for computed data (APY, decisions). Frontend never computes strategy logic.

### Transaction Flows

**Deposit:**
1. Connect wallet, select risk tier, enter amount
2. Check USDC balance (if zero → "You need USDC" with swap link)
3. Check SOL balance (if < 0.01 → "Need SOL for fees")
4. Check UserPosition for pending withdrawal (if exists → block deposit)
5. Fetch fresh share price from RiskVault
6. Build `deposit` instruction, wallet signs
7. Optimistic UI: update balance immediately on confirmation
8. Background refresh to reconcile with on-chain state

**Withdraw:**
1. Select tier, enter share amount
2. Build `request_withdraw` instruction, wallet signs
3. Show countdown: "Available in 1 day, 14 hours" (human-readable)
4. After redemption → `withdraw` button active
5. Build `withdraw` instruction, wallet signs
6. Show USDC received, fees breakdown

### UI States

| State | Display |
|---|---|
| No wallet | Connect CTA. Vault stats visible (public data) |
| Connected, no position | Deposit form, APY/TVL displayed |
| Deposit pending | Spinner + Solscan tx link + "Do NOT submit again" |
| Deposit confirmed | Updated balance, entry price, shares received |
| Withdrawal requested | Countdown timer to maturity |
| Withdrawal ready | "Complete withdrawal" button |
| Withdrawal pending | Spinner + Solscan link |
| Transaction failed | Human-readable error + retry button |
| Vault halted | Red banner: "Vault halted — withdrawals prioritized" |
| Keeper API down | "Keeper data temporarily unavailable" — balances still work |

### UX Edge Cases

| Edge Case | Mitigation |
|---|---|
| User signs tx, RPC congested (60s+) | Show tx signature immediately. "Transaction submitted — confirming." Explicit "Do NOT submit again." 90s timeout → "May still land — check Solscan" |
| APY stale (user waited 5 min before signing) | Timestamp on all data. Auto-refresh every 30s. Pre-sign fetch of fresh share price |
| Data jumps during rebalance | Atomic data fetch per page. Animate changes (not jarring jumps) |
| Multi-tab inconsistency | Poll on-chain state every 15s. Refresh on tab focus (`visibilitychange` event) |
| Deposit in tab 1, tab 2 stale | On-chain polling catches up within 15s. `BroadcastChannel` API for instant cross-tab sync |
| Anchor error codes | Map ALL to human-readable. Never show raw hex |
| Wallet popup blocked | Detect, show: "Allow popups for this site" |
| Browser closed mid-tx | On reconnect: check recent txs to allocator from this wallet. Show status. localStorage backup of last tx signature |
| Network mismatch (devnet/mainnet) | Check genesis hash on connect. Show: "Switch to [correct network]" |
| User returns after weeks | Show: position value in USDC, performance since deposit, activity summary, keeper health |
| Share price vs execution price mismatch | Show "estimated" pre-sign. Show actual post-confirm. Flag if > 0.5% difference |
| Zero USDC, has SOL only | "You need USDC to deposit" with link to Jupiter/exchange |
| User doesn't understand redemption | Pre-deposit disclosure: "Withdrawals have X-day processing period" in deposit flow |
| User picks aggressive unknowingly | Confirmation step: "This vault can lose up to 10%. Continue?" |
| APY display vs actual return | Show both: "Vault APY: 18% (gross)" and "Your return: 16.2% (net of fees)" |

### Performance

| Concern | Solution |
|---|---|
| Initial page load | Skeleton loading states. No layout shift (CLS) |
| Post-deposit balance lag | Optimistic UI on confirmation. Background reconciliation |
| Large rebalance history | Paginate (10 per page). Virtual scrolling if > 50 items |
| Multiple RPC calls | Batch via `getMultipleAccountsInfo()` — single request for all PDAs |

---

## 7. Deploy Infrastructure

All components deploy to VPS reclabs3 (151.245.137.75). No Vercel.

### VPS Setup

- **User:** `nanuqfi` (new — 1 project = 1 user)
- **Ports:** 9000 (keeper API), 9001 (frontend)
- **Containers:** `nanuqfi-keeper`, `nanuqfi-app`
- **Docker:** restart policy `unless-stopped`, health checks, `json-file` logging (`max-size: 10m`, `max-file: 3`)
- **GHCR auth:** copy from existing user's `.docker/config.json`

### Nginx + SSL

| Domain | Target | Type |
|---|---|---|
| `app.nanuqfi.com` | `localhost:9001` | A record → 151.245.137.75 |
| `keeper.nanuqfi.com` | `localhost:9000` | A record → 151.245.137.75 |

SSL via `certbot --nginx -d <domain>`.

### Keeper Docker

```
Image: Node 22 slim (existing Dockerfile)
Port: 9000 (host) → 3000 (container)
Env vars:
  DRIFT_RPC_URL, DRIFT_RPC_FALLBACK, DRIFT_ENV
  KEEPER_WALLET_PATH=/run/secrets/keeper-wallet
  ANTHROPIC_API_KEY, ALLOCATOR_PROGRAM_ID
  KEEPER_CYCLE_INTERVAL=300000 (5 min)
  AI_CYCLE_INTERVAL=3600000 (1 hour)
  TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
Secrets: wallet keypair via Docker secrets (host file, permissions 600)
```

### Frontend Docker

```
Image: Node 22 slim, Next.js standalone output
Port: 9001 (host) → 3000 (container)
Env vars:
  NEXT_PUBLIC_RPC_URL
  NEXT_PUBLIC_ALLOCATOR_PROGRAM_ID
  NEXT_PUBLIC_KEEPER_API_URL=https://keeper.nanuqfi.com
```

### Allocator Program

- Devnet: `anchor deploy --provider.cluster devnet`
- Mainnet: `anchor deploy --provider.cluster mainnet-beta` (manual trigger only)
- Program ID: `2QtJ5kmxLuW2jYCFpJMtzZ7PCnKdoMwkeueYoDUi5z5P`
- Upgrade authority: RECTOR wallet

### CI/CD (GitHub Actions)

| Repo | Every push | Push to main |
|---|---|---|
| `nanuqfi/nanuqfi` | `pnpm turbo test` + `pnpm turbo lint` + `anchor build` | + devnet deploy (optional) |
| `nanuqfi/nanuqfi-keeper` | `pnpm test` + `pnpm build` + `pnpm lint` | + Docker → GHCR → SSH deploy → `docker image prune -f` |
| `nanuqfi/nanuqfi-app` | `pnpm build` + `pnpm lint` | + Docker → GHCR → SSH deploy → `docker image prune -f` |

Deploy uses `appleboy/ssh-action`. Mainnet program deploy is `workflow_dispatch` (manual).

### Docker Hygiene

- `docker image prune -f` after every deploy (in Actions script)
- Docker logging: `json-file`, `max-size: 10m`, `max-file: 3`
- No bind-mount logs to host
- Never `docker system prune` (shared VPS)
- Weekly cron safety net already exists on VPS

### Deploy Edge Cases

| Edge Case | Mitigation |
|---|---|
| Keeper container crash | `restart: unless-stopped` + health check. 3 unhealthy → restart. Telegram alert |
| GHCR pull fails | Check pull success before `up -d`. Fail → abort, old version continues |
| Wallet key exposure | Docker secrets (`/run/secrets/`), file permissions 600. Never in env var or image |
| Program deploy to mainnet accidentally | Manual trigger only (`workflow_dispatch`). Requires explicit confirmation |
| Disk bloat | `docker image prune -f` per deploy. Log rotation. 114 GB available |

---

## 8. Testing Strategy

Unit tests (211) stay green — mock mode untouched. New integration tests cover real Drift interactions.

### Test Layers

| Layer | Scope | Location | Trigger |
|---|---|---|---|
| Unit | Mock mode (existing 211) | All repos | Every push, offline |
| Integration — SDK | Real Drift SDK on devnet | `backend-drift/tests/integration/` | PR only |
| Integration — CPI | Allocator ↔ Drift vault | `programs/allocator/tests/` | PR only |
| Integration — Keeper | Full cycle with real data | `nanuqfi-keeper/tests/integration/` | PR only |
| E2E | Full pipeline on devnet | Separate test script | Manual pre-mainnet |

### SDK Integration Tests

```
DriftLendingBackend real mode:
  - deposit 10 USDC on devnet → verify spot position
  - getExpectedYield → verify real rate (>0)
  - withdraw 10 USDC → verify balance restored
  - getPosition → verify actual state

DriftBasisTradeBackend real mode:
  - deposit collateral + open perp short → verify both legs
  - shouldAutoExit with real funding history
  - withdraw → close both legs → verify cleanup
  - partial fill handling

DriftFundingBackend real mode:
  - open directional perp → verify position
  - shouldAutoExit with real PnL
  - close → verify cleanup

DriftJitoDNBackend real mode:
  - Jupiter swap USDC → JitoSOL → verify
  - deposit JitoSOL + perp short → verify
  - shouldAutoExit with real rates
  - close + swap back → verify
```

### CPI Integration Tests

```
Deposit flow:
  - initialize allocator + risk vault on localnet
  - deposit USDC → verify shares minted + Drift vault funded
  - share price accuracy

Withdraw flow:
  - deposit → request_withdraw → wait → withdraw
  - verify USDC, shares burned, worse-of pricing, performance fee

Rebalance:
  - keeper rebalance with new weights → guardrails enforced
  - RebalanceRecord written

Emergency halt:
  - trigger → deposits blocked, redemptions accelerated

Edge cases:
  - deposit during halt → rejected
  - withdraw before redemption → rejected
  - rebalance >20% shift → rejected
  - double request_withdraw → HasPendingWithdrawal
  - stale oracle → rejected
```

### Non-Hanging Rules

- Timeout: 5s unit, 30s integration, 60s E2E
- Setup/teardown: close connections, abort controllers
- Devnet calls: `withTimeout()` — slow = FAIL, never hang
- Integration tests: separate script (`pnpm test:integration`), not in `pnpm test`

### Pre-Mainnet E2E Gate (Manual)

1. Deploy allocator to devnet
2. Create Drift vaults (moderate + aggressive)
3. Set keeper as trading delegate
4. Deposit 10 USDC into moderate → verify shares
5. Run keeper 3 full cycles → verify decisions logged
6. Trigger auto-exit condition → verify response
7. Request withdrawal → wait → complete withdrawal
8. Verify: USDC returned, fees correct, positions closed
9. Emergency halt → verify behavior
10. All pass → green light for mainnet

### CI Pipeline

```
Every push (all repos):
  pnpm test              # unit only, offline

PR only (core monorepo):
  pnpm test:integration  # devnet SDK tests (DEVNET_RPC_URL secret)
  anchor test            # localnet CPI tests

PR only (keeper):
  pnpm test:integration  # devnet cycle tests
```

---

## 9. Mainnet Launch Plan

### Pre-Mainnet Checklist (Hard Gates)

All must pass before mainnet deploy:

1. All integration tests green on devnet
2. E2E gate passed (10-step manual test)
3. Allocator on devnet for minimum 3 days, no issues
4. Keeper ran 72+ consecutive hours on devnet without crash
5. Wallet connect tested with Phantom + Solflare on devnet
6. Frontend shows correct data for all UI states
7. CI/CD deploys all 3 repos successfully

### Deploy Sequence

**Day 1: Infrastructure**
- Deploy allocator to mainnet (`anchor deploy --provider.cluster mainnet-beta`)
- Verify on Solscan
- Initialize allocator (admin = RECTOR wallet)
- Initialize treasury (treasury PDA + USDC token account for fee collection)
- Initialize 2 risk vaults (moderate, aggressive) with deposit caps ($100 seed phase)
- Create Drift vaults via Drift Vault program, allocator PDA as manager
- Set keeper wallet as trading delegate on each Drift vault
- Deploy keeper (mainnet env vars)
- Deploy frontend (mainnet RPC + program ID)

**Day 2-3: Seed**
- RECTOR deposits $50-100 per vault
- Monitor keeper 48 hours
- Verify: rebalances, decisions, transparency UI, all strategies execute

**Day 4+: Open**
- Tight caps initially, increase with confidence

### Cap Progression

| Phase | Max per vault | Total TVL | Advance when |
|---|---|---|---|
| Seed | $100 (RECTOR only) | $200 | 48h clean operation |
| Limited | $1,000 | $2,000 | 1 week clean, all strategies executed |
| Open | $10,000 | $20,000 | Judges verify |
| Post-hackathon | Based on security review | — | After audit |

### Monitoring

| Monitor | Method | Alert |
|---|---|---|
| Keeper health | UptimeRobot → `GET /health` every 60s | Telegram if down > 2 min |
| Docker container | Health check + restart policy | Auto-restart + Telegram if 3 restarts |
| On-chain heartbeat | Keeper writes every cycle | 2 missed → Telegram CRITICAL |
| Drawdown | Keeper checks every cycle | WARNING at 50% of max, CRITICAL at 80% |
| Emergency halt | On-chain event | Telegram CRITICAL |
| RPC failover | Circuit breaker | Telegram WARNING on primary fail |
| SOL balance | Keeper checks every cycle | WARNING at 0.05, CRITICAL at 0.01 |

### Program Rollback Plan

1. Keep every deployed binary (`.so` file) tagged by commit hash
2. Before any upgrade: verify account schema compatibility (new fields must have defaults)
3. If upgrade breaks: emergency halt → redeploy previous binary → verify accounts readable
4. Upgrade authority: RECTOR wallet. Post-hackathon: Squads multisig
5. Test every upgrade on devnet with real account data before mainnet

### Mainnet Edge Cases

| Edge Case | Mitigation |
|---|---|
| Program bug post-deploy | Emergency halt → redeploy previous binary → verify. Keep all deployed `.so` files |
| Keeper wallet compromised | Trading delegate only, can't withdraw. Rotate via `update_keeper_authority`. Old key immediately invalid |
| RPC costs | Helius plan. Keeper ~5 req/cycle, well within free tier |
| Drift protocol incident | Keeper detects, triggers emergency halt. Frontend banner. Manual intervention |

### Hackathon Submission Package

| Item | Details |
|---|---|
| Demo video (3 min) | Wallet connect → deposit → transparency UI → keeper decisions → on-chain guardrails |
| Strategy docs | Thesis (multi-strategy routing), mechanics (4 strategies, 2 risk tiers), risk management |
| Code repository | github.com/nanuqfi (all 3 repos, public) |
| On-chain verification | Program ID + vault addresses on Solscan |

---

## 10. Hackathon Scope vs Post-Hackathon

### In Scope (Hackathon)

- 2 vaults: moderate, aggressive
- 4 strategies: lending, basis trade, funding capture, JitoSOL DN
- Full execution pipeline: real deposits, real positions, real withdrawals
- AI keeper with real market data
- Transparency UI with wallet connect
- Mainnet deployment with track record

### Post-Hackathon (In Codebase, Not Active)

- Conservative vault (re-enable after hackathon rules don't apply)
- DriftInsuranceBackend (insurance pools disqualified from hackathon)
- Ultra-conservative vault (lending-only)
- Additional backends: Mango, Marginfi, Kamino
- Custom risk vaults (user-defined caps)
- Cross-chain: Hyperliquid, Arbitrum
