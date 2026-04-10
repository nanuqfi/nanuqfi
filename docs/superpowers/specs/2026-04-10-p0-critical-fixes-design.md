# P0-Critical Fixes Design Spec

**Date:** 2026-04-10
**Scope:** 5 P0-critical issues across 3 repos (nanuqfi, nanuqfi-app, nanuqfi-keeper)
**Approach:** Fix + verify (each fix includes a test proving it works)
**Branching:** One `fix/p0-critical-hardening` branch per repo (3 branches, 3 PRs)

---

## Issues Covered

| # | Repo | Title | Risk |
|---|------|-------|------|
| #30 | nanuqfi | Missing token::mint and token::authority constraints | Token substitution attack |
| #29 | nanuqfi | Devnet feature in default Cargo features | Admin instructions leak to mainnet |
| #21 | nanuqfi-app | NEXT_PUBLIC_ exposes Helius RPC API key | API key in client bundle |
| #22 | nanuqfi-app | Withdraw assumes 1:1 share price | Incorrect fund display/loss |
| #9 | nanuqfi-keeper | Fire-and-forget rebalance | On-chain state divergence |

---

## Repo 1: nanuqfi/nanuqfi

### Fix #29 — Remove devnet from default Cargo features

**Problem:** `default = ["devnet"]` in `programs/allocator/Cargo.toml` means `admin_reset_vault`, `admin_set_tvl`, and `admin_set_rebalance_counter` compile into mainnet builds. Compromised admin key = nuke vault accounting.

**Fix:**
- `programs/allocator/Cargo.toml`: `default = ["devnet"]` -> `default = []`

**Verification:**
- `cargo build` (no features) must succeed without devnet admin instructions
- `cargo build --features devnet` must still compile them for testing
- Existing `anchor test` passes (tests use `--features devnet` via Anchor.toml)

### Fix #30 — Add token mint/authority constraints

**Problem:** `user_usdc`, `user_shares`, and `protocol_usdc` token accounts in Deposit, Withdraw, AllocateToProtocol, and RecallFromProtocol have no `token::mint` or `token::authority` constraints. An attacker can pass fake-mint token accounts to steal or redirect funds.

**Affected instruction contexts and required constraints:**

#### Deposit context
```rust
// user_usdc: add token::mint constraint
#[account(mut, token::mint = allocator.usdc_mint)]
pub user_usdc: Account<'info, TokenAccount>,

// user_shares: add token::mint + token::authority constraints
#[account(mut, token::mint = risk_vault.share_mint, token::authority = user)]
pub user_shares: Account<'info, TokenAccount>,
```

#### Withdraw context
```rust
// user_usdc: add token::mint constraint
#[account(mut, token::mint = allocator.usdc_mint)]
pub user_usdc: Account<'info, TokenAccount>,

// user_shares: add token::mint + token::authority constraints
#[account(mut, token::mint = risk_vault.share_mint, token::authority = user)]
pub user_shares: Account<'info, TokenAccount>,
```

#### AllocateToProtocol context
```rust
// protocol_usdc: add token::mint constraint
#[account(mut, token::mint = allocator.usdc_mint)]
pub protocol_usdc: Account<'info, TokenAccount>,
```

#### RecallFromProtocol context
```rust
// protocol_usdc: add token::mint constraint
#[account(mut, token::mint = allocator.usdc_mint)]
pub protocol_usdc: Account<'info, TokenAccount>,
```

**Prerequisite:** Verify `allocator.usdc_mint` field exists in the Allocator state struct. If not, it must be added (set during `initialize_allocator`) and the USDC mint passed as an account. Similarly verify `risk_vault.share_mint` is accessible in each context.

**Verification:**
- `anchor build` succeeds
- `anchor test` passes (existing tests already use correct mints)
- Add negative test: pass wrong-mint token account to Deposit -> expect `ConstraintTokenMint` error

---

## Repo 2: nanuqfi/nanuqfi-app

### Fix #21 — Remove RPC API key from client bundle

**Problem:** `NEXT_PUBLIC_RPC_URL` embeds the Helius API key in the client JavaScript bundle. Anyone can extract it from browser DevTools.

**Fix:**
1. Create server-side RPC proxy route: `src/app/api/rpc/route.ts`
   - Reads `HELIUS_RPC_URL` (no `NEXT_PUBLIC_` prefix) from server env
   - Accepts POST with JSON-RPC body, forwards to Helius, returns response
   - Basic validation: reject non-POST, validate JSON-RPC structure
   - Rate limit consideration: rely on Helius rate limits for now (devnet)
2. Update `src/providers/solana-provider.tsx`:
   - Change endpoint from `NEXT_PUBLIC_RPC_URL` to `/api/rpc`
3. Update environment files:
   - Rename `NEXT_PUBLIC_RPC_URL` -> `HELIUS_RPC_URL` in `.env`, `.env.example`
   - Remove any other `NEXT_PUBLIC_` vars that contain API keys
4. Update Vercel/deployment env vars if applicable

**Verification:**
- `pnpm build` succeeds with no `NEXT_PUBLIC_RPC_URL` references
- `grep -r "NEXT_PUBLIC_RPC_URL"` returns zero hits in src/
- RPC proxy route test: POST valid JSON-RPC -> 200, GET -> 405

### Fix #22 — Use actual share price in withdraw

**Problem:** `deposit-form.tsx` line 76 uses `shares / 1e6` for the MAX button and amount display, assuming 1:1 share price. The on-chain program uses: `effective_price = min(current_price, request_time_price)` and `gross_usdc = shares * effective_price / 1_000_000`.

**Fix:**
1. Pass `sharePrice` (already fetched in vault detail page via on-chain data) into `DepositForm` as a prop
2. Update MAX button: `setAmount(String(Number(userShares) * sharePrice / 1e6 / 1e6))`
   - First `/1e6` converts from raw shares to share units
   - `* sharePrice / 1e6` applies the price (SHARE_PRICE_PRECISION = 1_000_000)
3. Update withdraw amount display to show estimated USDC using share price
4. Add a "Share Price" indicator in the form so users can see the current rate

**Verification:**
- Unit test: sharePrice = 1_200_000 (1.2x), 100 shares -> expect 120 USDC display
- Unit test: sharePrice = 1_000_000 (1.0x), 100 shares -> expect 100 USDC display
- Visual: MAX button shows correct USDC value when share price != 1.0

---

## Repo 3: nanuqfi/nanuqfi-keeper

### Fix #9 — Await rebalance and verify on-chain state

**Problem:** `submitRebalance()` in `keeper.ts` is called without `await`. The cycle logs "success" and records the decision before knowing if the transaction confirmed. If the tx fails silently, the keeper's internal weights diverge from on-chain state, and rebalance counter gets out of sync.

**Fix:**
1. `keeper.ts` `runCycle()`: replace fire-and-forget with `await submitRebalance()`
2. On tx failure:
   - Do NOT record decision as "executed"
   - Log error with full context (weights, counter, error)
   - Send Telegram alert: "Rebalance tx failed: {error}"
   - Mark cycle as failed in decision history
3. On tx success:
   - Verify: fetch on-chain allocator account, compare actual weights to submitted weights
   - If diverged: log warning + Telegram alert, mark as "unverified"
   - If matched: mark as "confirmed"
4. Add `verifyOnChainState()` helper:
   - Fetches allocator + risk vault accounts
   - Compares total_assets, allocation percentages
   - Returns `{ matched: boolean, divergences: string[] }`

**Verification:**
- Unit test: mock `submitRebalance` rejection -> decision NOT recorded as success
- Unit test: mock `submitRebalance` success + verification match -> decision marked "confirmed"
- Unit test: mock `submitRebalance` success + verification mismatch -> decision marked "unverified" + alert sent

---

## Out of Scope

- P1-hardening issues (separate pass)
- Mainnet migration (separate initiative)
- Rate limiting on RPC proxy (rely on Helius limits for devnet)
- Full reconciliation loop in keeper (this fix adds one-shot verification, not continuous reconciliation)

## Risk Assessment

- **#29** is a one-line change with zero regression risk
- **#30** may require adding `usdc_mint` to the Allocator struct if it doesn't exist — this would change account layout and require migration or redeploy
- **#21** changes how the frontend connects to RPC — test thoroughly, Solana wallet adapter must work with proxy
- **#22** is UI math — low risk, high impact on correctness
- **#9** changes the keeper's core loop timing — awaiting tx means longer cycles, but correctness > speed
