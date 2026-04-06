# Production Hardening — All 26 Audit Issues

**Date:** 2026-04-06
**Scope:** nanuqfi/nanuqfi core monorepo — Anchor program + TypeScript SDK + CI/repo
**Source:** Production readiness audit (issues #1–#26)
**Approach:** Phased execution (Approach C) — security-first, domain-batched, parallel where safe

---

## Execution Strategy

Two phases with a hard checkpoint between them. Program changes are sequential (on-chain, high-risk). SDK/CI/repo changes parallelized via agents in worktrees.

### Phase 1 — Security & Structure

Must be right. No shortcuts. Checkpoint before Phase 2.

| Order | Issue | Title | Domain | Priority |
|-------|-------|-------|--------|----------|
| 1 | #16 | Version fields on all account structs | Program | P1 |
| 2 | #1 | Constrain vault_usdc in Deposit/Withdraw/Allocate/Recall | Program | P0 |
| 3 | #2 | Replace saturating_sub with checked_sub | Program | P0 |
| 4 | #3 | Cumulative fees — add total_fees_withdrawn | Program | P0 |
| 5 | #20 | First-depositor share inflation protection | Program | P0 |
| 6 | #15 | Protocol whitelist for keeper allocations | Program | P0 |
| 7 | #21 | Close guardrail bypass via admin setters | Program | P1 |
| 8 | #13 | ESLint flat config + CI lint/type-check step | SDK/CI | P0 |
| 9 | #18 | pnpm audit + cargo audit in CI | CI | P1 |
| 10 | #17 | Vitest coverage tooling + thresholds | CI | P1 |

**Checkpoint:** `anchor build && anchor test && pnpm turbo test && pnpm turbo lint`

### Phase 2 — Hardening & Cleanup

Parallelizable. Lower risk. Three streams.

**Program stream (sequential):**

| Order | Issue | Title | Priority |
|-------|-------|-------|----------|
| 11 | #5 | Gate admin utilities for devnet-only | P1 |
| 12 | #22 | Account close instructions + RebalanceRecord pruning | P1 |
| 13 | #4 | Event emission for all critical instructions | P0 |

**SDK stream (parallel agents):**

| Order | Issue | Title | Priority |
|-------|-------|-------|----------|
| 14 | #6 | Retry, timeout, backoff for external API calls | P1 |
| 15 | #14 | Structured logging interface | P1 |
| 16 | #23 | Error observability in router | P1 |
| 17 | #24 | Runtime response validation for external APIs | P1 |
| 18 | #12 | Injectable cache instances (replace singletons) | P2 |
| 19 | #25 | Stale-while-revalidate cache pattern | P2 |
| 20 | #10 | Env var for RPC/API URLs | P2 |
| 21 | #11 | Backtest protocol config as input | P2 |
| 22 | #8 | Remove `as any` in scripts | P2 |

**Repo stream (parallel agents):**

| Order | Issue | Title | Priority |
|-------|-------|-------|----------|
| 23 | #19 | LICENSE file | P1 |
| 24 | #7 | Remove dead Drift code | P2 |
| 25 | #9 | .env.example | P2 |
| 26 | #26 | Generated API documentation | P2 |

---

## Phase 1: Technical Design

### #16 — Version fields on all account structs

Add `version: u8` as the **first field** (after discriminator) in all 6 account structs:

```rust
#[account]
#[derive(InitSpace)]
pub struct Allocator {
    pub version: u8,          // NEW — migration support
    pub admin: Pubkey,
    // ... existing fields
}
```

Applies to: `Allocator`, `RiskVault`, `UserPosition`, `Treasury`, `RebalanceRecord`, `KeeperLease`.

**Impact:** Changes `InitSpace` for all accounts. Existing devnet accounts become incompatible — requires program redeploy + re-initialize. This is acceptable on devnet.

**Constant:** `pub const CURRENT_VERSION: u8 = 1;`

### #1 — Constrain vault_usdc in Deposit/Withdraw/Allocate/Recall

Current state: `vault_usdc` is `#[account(mut)]` with no validation. Any token account can be passed.

Fix — derive vault_usdc as a PDA-associated token account:

```rust
#[account(
    mut,
    associated_token::mint = usdc_mint,
    associated_token::authority = risk_vault,
)]
pub vault_usdc: Account<'info, TokenAccount>,
```

Applies to: `Deposit`, `Withdraw`, `AllocateToProtocol`, `RecallFromProtocol` account structs.

Add `usdc_mint` account to each context where missing:

```rust
pub usdc_mint: Account<'info, Mint>,
```

### #2 — Replace saturating_sub with checked_sub

3 instances:

1. **Line ~411** (withdraw — TVL decrement):
   ```rust
   // Before
   allocator_account.total_tvl = allocator_account.total_tvl.saturating_sub(gross_usdc);
   // After
   allocator_account.total_tvl = allocator_account.total_tvl
       .checked_sub(gross_usdc)
       .ok_or(ErrorCode::ArithmeticUnderflow)?;
   ```

2. **Line ~600** (rebalance — fee deduction):
   ```rust
   vault.total_assets = vault.total_assets
       .checked_sub(transfer_fee)
       .ok_or(ErrorCode::ArithmeticUnderflow)?;
   ```

3. **Line ~786** (withdraw_treasury):
   Same pattern.

Add to `errors.rs`:
```rust
#[error_code]
pub enum ErrorCode {
    // ... existing
    #[msg("Arithmetic underflow in financial calculation")]
    ArithmeticUnderflow,
}
```

### #3 — Cumulative fees + total_fees_withdrawn

Add field to `Treasury`:

```rust
pub struct Treasury {
    pub version: u8,
    pub allocator: Pubkey,
    pub usdc_token_account: Pubkey,
    pub total_fees_collected: u64,    // cumulative, append-only
    pub total_fees_withdrawn: u64,    // NEW — tracks withdrawals
    pub bump: u8,
}
```

In `withdraw_treasury`:
```rust
// Before: treasury.total_fees_collected -= amount;
// After:
let available = treasury.total_fees_collected
    .checked_sub(treasury.total_fees_withdrawn)
    .ok_or(ErrorCode::ArithmeticUnderflow)?;
require!(amount <= available, ErrorCode::InsufficientFees);
treasury.total_fees_withdrawn = treasury.total_fees_withdrawn
    .checked_add(amount)
    .ok_or(ErrorCode::ArithmeticOverflow)?;
```

### #20 — First-depositor share inflation protection

Virtual offset approach (proven in ERC-4626):

```rust
const VIRTUAL_OFFSET: u64 = 1_000_000; // 1 USDC in base units

fn shares_for_deposit(amount: u64, vault: &RiskVault) -> Result<u64> {
    if vault.total_shares == 0 {
        // First deposit: 1:1, but enforce minimum
        require!(amount >= VIRTUAL_OFFSET, ErrorCode::DepositTooSmall);
        Ok(amount)
    } else {
        // Virtual offset prevents inflation attack
        let virtual_shares = vault.total_shares.checked_add(VIRTUAL_OFFSET).unwrap();
        let virtual_assets = vault.total_assets.checked_add(VIRTUAL_OFFSET).unwrap();
        amount.checked_mul(virtual_shares).unwrap()
            .checked_div(virtual_assets)
            .ok_or(ErrorCode::ArithmeticOverflow.into())
    }
}
```

Same virtual offset applied in share-to-asset conversion for withdrawals.

### #15 — Protocol whitelist

Add to `Allocator`:

```rust
pub const MAX_PROTOCOLS: usize = 8;

pub struct Allocator {
    // ... existing fields
    pub protocol_whitelist: Vec<Pubkey>,  // max MAX_PROTOCOLS
}
```

New instructions:

```rust
pub fn add_whitelisted_protocol(ctx: Context<AdminUpdateAllocator>, protocol: Pubkey) -> Result<()> {
    let allocator = &mut ctx.accounts.allocator;
    require!(allocator.protocol_whitelist.len() < MAX_PROTOCOLS, ErrorCode::WhitelistFull);
    require!(!allocator.protocol_whitelist.contains(&protocol), ErrorCode::AlreadyWhitelisted);
    allocator.protocol_whitelist.push(protocol);
    Ok(())
}

pub fn remove_whitelisted_protocol(ctx: Context<AdminUpdateAllocator>, protocol: Pubkey) -> Result<()> {
    let allocator = &mut ctx.accounts.allocator;
    let idx = allocator.protocol_whitelist.iter()
        .position(|p| p == &protocol)
        .ok_or(ErrorCode::NotWhitelisted)?;
    allocator.protocol_whitelist.remove(idx);
    Ok(())
}
```

In `allocate_to_protocol`:
```rust
require!(
    allocator.protocol_whitelist.contains(&ctx.accounts.protocol_usdc.owner),
    ErrorCode::ProtocolNotWhitelisted
);
```

### #21 — Guardrail bypass via admin setters

Add minimum bounds:

```rust
pub fn admin_set_redemption_period(ctx: Context<AdminResetVault>, slots: u64) -> Result<()> {
    const MIN_REDEMPTION_SLOTS: u64 = 100; // ~40 seconds on Solana
    require!(slots >= MIN_REDEMPTION_SLOTS, ErrorCode::RedemptionPeriodTooShort);
    ctx.accounts.risk_vault.redemption_period_slots = slots;
    Ok(())
}
```

Add per-transaction deposit limit to `RiskVault`:
```rust
pub max_single_deposit: u64,  // per-tx cap, prevents flash-loan deposits
```

Enforce in `deposit`:
```rust
require!(amount <= vault.max_single_deposit || vault.max_single_deposit == 0, ErrorCode::DepositExceedsLimit);
```

### #13 — ESLint flat config + CI

Create `eslint.config.js` (ESLint v9 flat config):
- TypeScript strict rules via `@typescript-eslint/recommended`
- No unused vars, no explicit any
- Applied to all `packages/*/src/**/*.ts` and `scripts/**/*.ts`

Add to `.github/workflows/ci.yml`:
```yaml
- name: Lint
  run: pnpm turbo lint
- name: Type check
  run: pnpm turbo build  # tsconfig strict already enforced
```

### #18 — Security scanning in CI

Add CI step:
```yaml
- name: Audit dependencies
  run: pnpm audit --audit-level=high || true  # warn, don't block (yet)
- name: Cargo audit
  run: cargo install cargo-audit && cargo audit
```

### #17 — Coverage tooling

Install `@vitest/coverage-v8`. Add coverage config to each package's vitest config:
```ts
coverage: {
  provider: 'v8',
  include: ['src/**/*.ts'],
  exclude: ['src/**/*.test.ts'],
  thresholds: { lines: 80, functions: 80, branches: 70 },
}
```

---

## Phase 2: Technical Design

### #5 — Admin devnet gate

Compile-time feature flag:

```rust
#[cfg(feature = "devnet")]
pub fn admin_reset_vault(ctx: Context<AdminResetVault>) -> Result<()> { /* ... */ }

#[cfg(feature = "devnet")]
pub fn admin_set_tvl(ctx: Context<AdminSetTvl>, tvl: u64) -> Result<()> { /* ... */ }
```

In `Cargo.toml`:
```toml
[features]
default = ["devnet"]
devnet = []
```

Mainnet build: `anchor build -- --no-default-features`

### #22 — Account close + RebalanceRecord pruning

```rust
pub fn close_user_position(ctx: Context<CloseUserPosition>) -> Result<()> {
    let position = &ctx.accounts.user_position;
    require!(position.shares == 0, ErrorCode::NonZeroShares);
    require!(position.pending_withdrawal_shares == 0, ErrorCode::PendingWithdrawal);
    // Anchor close = user (rent refund)
    Ok(())
}

pub fn close_rebalance_record(ctx: Context<CloseRebalanceRecord>) -> Result<()> {
    // Keeper or admin can prune old records
    Ok(())
}
```

### #4 — Event emission

Define events for all critical state changes:

```rust
#[event]
pub struct DepositEvent {
    pub user: Pubkey,
    pub risk_vault: Pubkey,
    pub amount: u64,
    pub shares_minted: u64,
    pub share_price: u64,
    pub slot: u64,
}

// Similar: WithdrawRequestEvent, WithdrawEvent, RebalanceEvent,
// AllocationEvent, RecallEvent, EmergencyHaltEvent, ResumeEvent,
// FeeCollectedEvent, GuardrailUpdateEvent, ProtocolWhitelistEvent
```

Add `emit!()` at the end of each instruction handler.

### #6 — Retry/timeout/backoff

Shared utility in `@nanuqfi/core`:

```typescript
export async function fetchWithRetry(
  url: string,
  opts?: RequestInit & { retries?: number; baseDelay?: number; timeout?: number }
): Promise<Response> {
  const { retries = 3, baseDelay = 1000, timeout = 10_000, ...fetchOpts } = opts ?? {};
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, { ...fetchOpts, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      if (res.status < 500 && res.status !== 429) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      clearTimeout(timer);
      if (attempt === retries) throw err;
    }
    await new Promise(r => setTimeout(r, baseDelay * 2 ** attempt));
  }
  throw new Error('Unreachable');
}
```

Apply in: `marginfi-data-api.ts`, `kamino-api.ts`, `lulo-api.ts`, `defillama-api.ts`.

### #14 — Structured logging

```typescript
export interface Logger {
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  debug(msg: string, ctx?: Record<string, unknown>): void;
}

export const consoleLogger: Logger = {
  info: (msg, ctx) => console.log(JSON.stringify({ level: 'info', msg, ...ctx, ts: Date.now() })),
  // ... same pattern
};
```

Inject via backend config. No external dependencies.

### #23 — Router error observability

In `YieldRouter.route()`, log backend failures from `Promise.allSettled`:

```typescript
const results = await Promise.allSettled(/* ... */);
for (const [i, result] of results.entries()) {
  if (result.status === 'rejected') {
    this.logger?.warn('Backend failed during routing', {
      backend: backends[i].name,
      error: result.reason?.message,
      circuitState: this.breakers.get(backends[i].name)?.state,
    });
  }
}
```

### #24 — Response validation

Lightweight type guards per API:

```typescript
function isKaminoReserveResponse(data: unknown): data is KaminoReserveResponse {
  return typeof data === 'object' && data !== null
    && Array.isArray((data as any).reserves);
}
```

Validate before type assertion. Throw descriptive error on mismatch.

### #12 + #25 — Injectable caches + SWR

```typescript
export interface Cache<T> {
  get(key: string): { value: T; stale: boolean } | undefined;
  set(key: string, value: T): void;
}
```

Default `MapCache<T>` with TTL + stale window. Replace module-level Maps. SWR: return stale value immediately, trigger background refresh.

### #10 — Env vars for URLs

Replace hardcoded URLs with env fallbacks:
```typescript
const KAMINO_API_URL = process.env.KAMINO_API_URL ?? 'https://api.kamino.finance';
```

### #11 — Backtest config as input

`runBacktest()` accepts `BacktestConfig` parameter instead of importing hardcoded constants.

### #8 — Remove `as any` in scripts

Exploration found none in packages. Check scripts for any remaining instances and fix with proper types.

### #19 — LICENSE

BUSL-1.1 (Business Source License) — standard for DeFi protocols. Allows reading/auditing, restricts commercial use without license.

### #7 — Dead Drift code

Delete `scripts/setup-drift-user.ts`. Clean Drift references in `setup-devnet.ts`, `e2e-gate.ts`, `test-phase-b.ts`, `test-phase-c.ts`. Remove Drift mentions from code comments.

### #9 — .env.example

```env
# RPC
SOLANA_RPC_URL=https://api.devnet.solana.com

# Lulo (required for backend-lulo real mode)
LULO_API_KEY=

# Integration test flags
KAMINO_INTEGRATION=false
BACKTEST_INTEGRATION=false
```

### #26 — API docs

Add TypeDoc config. Generate to `docs/api/`. Add `docs` script to root package.json.

---

## Branching

- One branch per issue: `fix/1-vault-usdc-constraints`, `fix/2-checked-sub`, etc.
- One commit per issue, conventional format: `fix(program): constrain vault_usdc (#1)`
- Program branches merge sequentially to `main`
- SDK/CI branches can merge in any order after Phase 1 checkpoint

## Testing

- Every program change: `anchor build && anchor test`
- Every SDK change: package-level `pnpm test` + full `pnpm turbo test`
- Phase 1 checkpoint: full suite + lint + type-check
- Phase 2 checkpoint: full suite + coverage report

## Risk

- **Account struct changes (#16, #3, #15, #21):** Require devnet redeploy + re-initialize. Acceptable — devnet TVL is test funds.
- **vault_usdc constraint (#1):** May need ATA initialization changes in tests/scripts. High confidence — well-understood Anchor pattern.
- **Events (#4):** Increases program binary size. Monitor with `anchor build` output.
