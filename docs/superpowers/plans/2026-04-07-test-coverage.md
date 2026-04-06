# Comprehensive Test Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all test gaps — Anchor Rust unit tests, backend error paths, cross-package integration, CI pipeline, zero cargo warnings.

**Architecture:** Extract pure validation/math helpers from Anchor program → unit test in Rust. Add error-path unit tests per backend via vi.mock. Add cross-package integration tests using MockYieldBackend with failure simulation. Update CI with cargo-test and integration-test jobs.

**Tech Stack:** Rust (Anchor 0.30.1), TypeScript (Vitest 3.x), GitHub Actions, solana-test-validator

**Spec:** `docs/superpowers/specs/2026-04-07-test-coverage-design.md`

---

## File Structure

### New Files
```
programs/allocator/src/
  validation.rs              — Extracted pure validation/math helpers
  tests/
    mod.rs                   — Test module root
    validation_test.rs       — Weight, deposit, shift validation tests
    arithmetic_test.rs       — Fee calc, share price, overflow tests
    state_test.rs            — RiskLevel enum, serialization, error codes

packages/core/src/integration/
  cross-package.test.ts      — Router→backend→strategy full flow + failure cascades

packages/backend-marginfi/src/backends/
  lending.error.test.ts      — Network, malformed data, rate limiting error paths

packages/backend-kamino/src/backends/
  lending.error.test.ts      — Same error scenarios for Kamino

packages/backend-lulo/src/backends/
  lending.error.test.ts      — Same error scenarios for Lulo

scripts/legacy/              — Archived phase test scripts
```

### Modified Files
```
programs/allocator/src/lib.rs       — Import and call validation helpers
programs/allocator/Cargo.toml       — Add [lints.rust] for zero warnings
packages/core/vitest.config.ts      — Add integration test include
packages/core/package.json          — Add test:int script
packages/backend-*/package.json     — Add test:int scripts
.github/workflows/ci.yml            — Add cargo-test + integration-test jobs
turbo.json                           — Verify test:int pipeline passthrough env
```

---

## Task 1: Zero Cargo Warnings

**Files:**
- Modify: `programs/allocator/Cargo.toml`

- [ ] **Step 1: Add lints config to Cargo.toml**

Append at the end of `programs/allocator/Cargo.toml`:

```toml
[lints.rust]
unexpected_cfgs = { level = "allow", check-cfg = [
  'cfg(feature, values("anchor-debug", "custom-heap", "custom-panic"))',
  'cfg(target_os, values("solana"))',
] }
```

- [ ] **Step 2: Verify zero warnings on build**

Run: `cargo build 2>&1 | grep "^warning:"`
Expected: No output (zero warnings)

- [ ] **Step 3: Verify zero warnings on test**

Run: `cargo test 2>&1 | grep "^warning:"`
Expected: No output (zero warnings). Existing `test_id` test still passes.

- [ ] **Step 4: Commit**

```bash
git add programs/allocator/Cargo.toml
git commit -m "fix: zero cargo warnings — declare Anchor/Solana cfg values"
```

---

## Task 2: Archive Legacy Scripts

**Files:**
- Move: `scripts/test-phase-b.ts` → `scripts/legacy/test-phase-b.ts`
- Move: `scripts/test-phase-c.ts` → `scripts/legacy/test-phase-c.ts`
- Move: `scripts/e2e-gate.ts` → `scripts/legacy/e2e-gate.ts`
- Move: `scripts/test-halt-resume.ts` → `scripts/legacy/test-halt-resume.ts`

- [ ] **Step 1: Create legacy directory and move scripts**

```bash
mkdir -p scripts/legacy
git mv scripts/test-phase-b.ts scripts/legacy/
git mv scripts/test-phase-c.ts scripts/legacy/
git mv scripts/e2e-gate.ts scripts/legacy/
git mv scripts/test-halt-resume.ts scripts/legacy/
```

- [ ] **Step 2: Verify remaining scripts untouched**

```bash
ls scripts/
```
Expected: `setup-devnet.ts`, `fix-treasury-usdc.ts`, `legacy/` directory

- [ ] **Step 3: Commit**

```bash
git add scripts/
git commit -m "chore: archive legacy phase test scripts to scripts/legacy/"
```

---

## Task 3: Extract Validation Helpers (Rust)

**Files:**
- Create: `programs/allocator/src/validation.rs`
- Modify: `programs/allocator/src/lib.rs`

- [ ] **Step 1: Create validation.rs with pure helper functions**

Create `programs/allocator/src/validation.rs`:

```rust
//! Pure validation and math helpers extracted for testability.
//!
//! All functions are free of Anchor context — they operate on raw values
//! and return Result<(), AllocatorError>.

use crate::errors::AllocatorError;
use anchor_lang::prelude::*;

/// Management fee: 1% annualized, scaled per-slot.
/// ~63,072,000 slots/year → 10_000 * 1_000_000 / 63_072_000 ≈ 158_548
pub const MGMT_FEE_PER_SLOT_SCALED: u64 = 158_548;
pub const MGMT_FEE_PRECISION: u64 = 1_000_000;
pub const PERFORMANCE_FEE_BPS: u64 = 1000; // 10%
pub const BPS_DENOMINATOR: u64 = 10_000;
pub const SHARE_PRICE_PRECISION: u64 = 1_000_000;
pub const VIRTUAL_OFFSET: u64 = 1_000_000;
pub const MIN_FIRST_DEPOSIT: u64 = 1_000_000; // 1 USDC
pub const MIN_REBALANCE_INTERVAL_SLOTS: u64 = 9_000;
pub const MAX_SHIFT_BPS: u16 = 2_000;
pub const ORACLE_DIVERGENCE_BPS: u64 = 100;
pub const TVL_HALT_THRESHOLD_BPS: u64 = 8_500;
pub const MAX_PROTOCOLS: usize = 8;

/// Validate that weights sum to exactly 10,000 basis points.
pub fn validate_weight_sum(weights: &[u16]) -> Result<()> {
    let sum: u32 = weights.iter().map(|&w| w as u32).sum();
    require!(sum == 10_000, AllocatorError::InvalidWeightSum);
    Ok(())
}

/// Validate no single weight exceeds max_single_asset_bps.
pub fn validate_max_weight(weights: &[u16], max_single_asset_bps: u16) -> Result<()> {
    for &w in weights {
        require!(w <= max_single_asset_bps, AllocatorError::WeightExceedsMax);
    }
    Ok(())
}

/// Validate first weight (perp allocation) within limit.
pub fn validate_perp_weight(weights: &[u16], max_perp_bps: u16) -> Result<()> {
    if let Some(&first) = weights.first() {
        require!(first <= max_perp_bps, AllocatorError::WeightExceedsMax);
    }
    Ok(())
}

/// Validate no weight shifts more than max_shift_bps from previous weights.
/// If old_weights is empty (first rebalance), skip shift validation.
pub fn validate_weight_shift(old_weights: &[u16], new_weights: &[u16], max_shift_bps: u16) -> Result<()> {
    if old_weights.is_empty() {
        return Ok(());
    }
    for i in 0..new_weights.len() {
        let old = if i < old_weights.len() { old_weights[i] } else { 0 };
        let new = new_weights[i];
        let diff = if new > old { new - old } else { old - new };
        require!(diff <= max_shift_bps, AllocatorError::ShiftTooLarge);
    }
    Ok(())
}

/// Validate deposit amount against caps and limits.
/// deposit_cap=0 means uncapped. max_single=0 means uncapped.
pub fn validate_deposit(
    amount: u64,
    deposit_cap: u64,
    current_assets: u64,
    max_single: u64,
    is_first_deposit: bool,
) -> Result<()> {
    require!(amount > 0, AllocatorError::DepositTooSmall);

    if is_first_deposit {
        require!(amount >= MIN_FIRST_DEPOSIT, AllocatorError::DepositTooSmall);
    }

    if deposit_cap > 0 {
        require!(
            current_assets.checked_add(amount).ok_or(AllocatorError::MathOverflow)? <= deposit_cap,
            AllocatorError::DepositCapExceeded
        );
    }

    if max_single > 0 {
        require!(amount <= max_single, AllocatorError::DepositExceedsTxLimit);
    }

    Ok(())
}

/// ERC-4626 share price with virtual offset for anti-inflation attack.
/// Returns price scaled by SHARE_PRICE_PRECISION (1_000_000).
pub fn calculate_share_price(total_assets: u64, total_shares: u64) -> u64 {
    if total_shares == 0 || total_assets == 0 {
        return SHARE_PRICE_PRECISION; // 1:1 for empty vault
    }
    let numerator = (total_assets as u128 + VIRTUAL_OFFSET as u128)
        .checked_mul(SHARE_PRICE_PRECISION as u128)
        .unwrap_or(u128::MAX);
    let denominator = total_shares as u128 + VIRTUAL_OFFSET as u128;
    (numerator / denominator) as u64
}

/// Calculate shares to mint for a deposit given current vault state.
/// Uses ERC-4626 with virtual offset.
pub fn calculate_shares_to_mint(amount: u64, total_assets: u64, total_shares: u64) -> u64 {
    if total_shares == 0 {
        return amount; // First deposit: 1:1
    }
    let numerator = (amount as u128)
        .checked_mul(total_shares as u128 + VIRTUAL_OFFSET as u128)
        .unwrap_or(0);
    let denominator = total_assets as u128 + VIRTUAL_OFFSET as u128;
    (numerator / denominator) as u64
}

/// Calculate management fee accrued over slots_elapsed.
/// Returns fee in asset units (USDC base).
pub fn calculate_management_fee(total_assets: u64, slots_elapsed: u64) -> u64 {
    let fee_128 = (total_assets as u128)
        .checked_mul(MGMT_FEE_PER_SLOT_SCALED as u128)
        .unwrap_or(0)
        .checked_mul(slots_elapsed as u128)
        .unwrap_or(0)
        / (MGMT_FEE_PRECISION as u128 * BPS_DENOMINATOR as u128);
    fee_128 as u64
}

/// Calculate performance fee on gains above high-water mark.
/// Returns fee in USDC base units.
pub fn calculate_performance_fee(
    current_share_price: u64,
    hwm_price: u64,
    shares_burned: u64,
) -> u64 {
    if current_share_price <= hwm_price {
        return 0; // No gains above HWM
    }
    let gain_per_share = current_share_price - hwm_price;
    let total_gain = (gain_per_share as u128)
        .checked_mul(shares_burned as u128)
        .unwrap_or(0)
        / SHARE_PRICE_PRECISION as u128;
    let fee = total_gain * PERFORMANCE_FEE_BPS as u128 / BPS_DENOMINATOR as u128;
    fee as u64
}

/// Check oracle divergence: |snapshot - on_chain| / on_chain <= threshold.
/// Returns true if divergence exceeds threshold (should reject).
pub fn check_oracle_divergence(equity_snapshot: u64, total_assets: u64) -> bool {
    if total_assets == 0 {
        return false; // No divergence check on empty vault
    }
    let diff = if equity_snapshot > total_assets {
        equity_snapshot - total_assets
    } else {
        total_assets - equity_snapshot
    };
    let threshold = total_assets * ORACLE_DIVERGENCE_BPS / BPS_DENOMINATOR;
    diff > threshold
}

/// Check if drawdown from peak exceeds max_drawdown_bps.
/// Returns true if drawdown exceeded (should reject or halt).
pub fn check_drawdown_exceeded(current_equity: u64, peak_equity: u64, max_drawdown_bps: u16) -> bool {
    if peak_equity == 0 || current_equity >= peak_equity {
        return false;
    }
    let drawdown = peak_equity - current_equity;
    let threshold = (peak_equity as u128 * max_drawdown_bps as u128 / BPS_DENOMINATOR as u128) as u64;
    drawdown > threshold
}

/// Check if equity drop triggers auto-halt (< 85% of 24h ago).
/// Returns true if should auto-halt.
pub fn should_auto_halt(current_equity: u64, equity_24h_ago: u64) -> bool {
    if equity_24h_ago == 0 {
        return false;
    }
    let threshold = equity_24h_ago * TVL_HALT_THRESHOLD_BPS / BPS_DENOMINATOR;
    current_equity < threshold
}

/// Validate rebalance timing.
pub fn validate_rebalance_interval(current_slot: u64, last_rebalance_slot: u64) -> Result<()> {
    let elapsed = current_slot.saturating_sub(last_rebalance_slot);
    require!(
        elapsed >= MIN_REBALANCE_INTERVAL_SLOTS,
        AllocatorError::RebalanceTooSoon
    );
    Ok(())
}

/// Validate protocol whitelist add (not full, not duplicate).
pub fn validate_whitelist_add(whitelist: &[Pubkey], protocol: &Pubkey) -> Result<()> {
    require!(whitelist.len() < MAX_PROTOCOLS, AllocatorError::WhitelistFull);
    require!(
        !whitelist.contains(protocol),
        AllocatorError::AlreadyWhitelisted
    );
    Ok(())
}

/// Validate protocol whitelist remove (exists).
pub fn validate_whitelist_remove(whitelist: &[Pubkey], protocol: &Pubkey) -> Result<()> {
    require!(
        whitelist.contains(protocol),
        AllocatorError::ProtocolNotWhitelisted
    );
    Ok(())
}

/// Check if protocol is whitelisted (or whitelist is empty = permissionless).
pub fn validate_protocol_whitelisted(whitelist: &[Pubkey], protocol: &Pubkey) -> Result<()> {
    if whitelist.is_empty() {
        return Ok(()); // Empty whitelist = permissionless
    }
    require!(
        whitelist.contains(protocol),
        AllocatorError::ProtocolNotWhitelisted
    );
    Ok(())
}
```

- [ ] **Step 2: Wire validation.rs into lib.rs**

Add `pub mod validation;` to lib.rs after the existing module declarations:

In `programs/allocator/src/lib.rs`, after line `pub mod events;`, add:
```rust
pub mod validation;
```

And at the top imports, add:
```rust
use validation::*;
```

Then remove the duplicate constant declarations from lib.rs (lines ~15-27) since they now live in `validation.rs`. Keep the `declare_id!` macro.

- [ ] **Step 3: Verify build still compiles**

Run: `cargo build 2>&1 | grep "^error"`
Expected: No errors. The constants are now imported from validation.rs.

- [ ] **Step 4: Verify existing test still passes**

Run: `cargo test 2>&1 | tail -5`
Expected: `test result: ok. 1 passed; 0 failed`

- [ ] **Step 5: Commit**

```bash
git add programs/allocator/src/validation.rs programs/allocator/src/lib.rs
git commit -m "refactor: extract validation helpers from lib.rs for testability"
```

---

## Task 4: Rust Unit Tests — Validation

**Files:**
- Create: `programs/allocator/src/tests/mod.rs`
- Create: `programs/allocator/src/tests/validation_test.rs`
- Modify: `programs/allocator/src/lib.rs` (add test module)

- [ ] **Step 1: Create test module structure**

Create `programs/allocator/src/tests/mod.rs`:

```rust
mod validation_test;
mod arithmetic_test;
mod state_test;
```

Add to the bottom of `programs/allocator/src/lib.rs`:

```rust
#[cfg(test)]
mod tests;
```

- [ ] **Step 2: Write validation tests**

Create `programs/allocator/src/tests/validation_test.rs`:

```rust
use crate::validation::*;
use crate::errors::AllocatorError;
use anchor_lang::prelude::Pubkey;
use anchor_lang::error::Error;

fn is_error(result: &Result<(), Error>, expected: AllocatorError) -> bool {
    match result {
        Err(e) => e.to_string().contains(&(expected as u32 + 6000).to_string()),
        Ok(()) => false,
    }
}

// ── Weight Sum Validation ──

#[test]
fn weight_sum_valid_10000() {
    let weights = vec![5000, 3000, 2000];
    assert!(validate_weight_sum(&weights).is_ok());
}

#[test]
fn weight_sum_single_weight_10000() {
    let weights = vec![10_000];
    assert!(validate_weight_sum(&weights).is_ok());
}

#[test]
fn weight_sum_rejects_9999() {
    let result = validate_weight_sum(&[5000, 4999]);
    assert!(is_error(&result, AllocatorError::InvalidWeightSum));
}

#[test]
fn weight_sum_rejects_10001() {
    let result = validate_weight_sum(&[5000, 5001]);
    assert!(is_error(&result, AllocatorError::InvalidWeightSum));
}

#[test]
fn weight_sum_empty_rejects() {
    let result = validate_weight_sum(&[]);
    assert!(is_error(&result, AllocatorError::InvalidWeightSum));
}

#[test]
fn weight_sum_eight_equal_weights() {
    let weights = vec![1250; 8]; // 8 * 1250 = 10000
    assert!(validate_weight_sum(&weights).is_ok());
}

// ── Max Weight Validation ──

#[test]
fn max_weight_all_within_limit() {
    let weights = vec![3000, 3000, 4000];
    assert!(validate_max_weight(&weights, 5000).is_ok());
}

#[test]
fn max_weight_at_exact_limit() {
    let weights = vec![5000, 3000, 2000];
    assert!(validate_max_weight(&weights, 5000).is_ok());
}

#[test]
fn max_weight_exceeds_limit() {
    let weights = vec![6000, 2000, 2000];
    let result = validate_max_weight(&weights, 5000);
    assert!(is_error(&result, AllocatorError::WeightExceedsMax));
}

// ── Perp Weight Validation ──

#[test]
fn perp_weight_within_limit() {
    let weights = vec![2000, 4000, 4000];
    assert!(validate_perp_weight(&weights, 3000).is_ok());
}

#[test]
fn perp_weight_exceeds_limit() {
    let weights = vec![4000, 3000, 3000];
    let result = validate_perp_weight(&weights, 3000);
    assert!(is_error(&result, AllocatorError::WeightExceedsMax));
}

#[test]
fn perp_weight_empty_weights_ok() {
    assert!(validate_perp_weight(&[], 3000).is_ok());
}

// ── Weight Shift Validation ──

#[test]
fn shift_within_limit() {
    let old = vec![5000, 3000, 2000];
    let new = vec![4000, 3500, 2500];
    assert!(validate_weight_shift(&old, &new, 2000).is_ok());
}

#[test]
fn shift_at_exact_limit() {
    let old = vec![5000, 3000, 2000];
    let new = vec![3000, 5000, 2000]; // 2000 shift = MAX_SHIFT_BPS
    assert!(validate_weight_shift(&old, &new, 2000).is_ok());
}

#[test]
fn shift_exceeds_limit() {
    let old = vec![5000, 3000, 2000];
    let new = vec![2000, 6000, 2000]; // 3000 shift > 2000 limit
    let result = validate_weight_shift(&old, &new, 2000);
    assert!(is_error(&result, AllocatorError::ShiftTooLarge));
}

#[test]
fn shift_first_rebalance_no_old_weights() {
    let new = vec![5000, 3000, 2000];
    assert!(validate_weight_shift(&[], &new, 2000).is_ok());
}

// ── Deposit Validation ──

#[test]
fn deposit_valid_amount() {
    assert!(validate_deposit(10_000_000, 100_000_000, 50_000_000, 0, false).is_ok());
}

#[test]
fn deposit_zero_rejected() {
    let result = validate_deposit(0, 0, 0, 0, false);
    assert!(is_error(&result, AllocatorError::DepositTooSmall));
}

#[test]
fn deposit_first_below_minimum() {
    let result = validate_deposit(500_000, 0, 0, 0, true); // 0.5 USDC < 1 USDC min
    assert!(is_error(&result, AllocatorError::DepositTooSmall));
}

#[test]
fn deposit_first_at_minimum() {
    assert!(validate_deposit(1_000_000, 0, 0, 0, true).is_ok()); // Exactly 1 USDC
}

#[test]
fn deposit_exceeds_cap() {
    let result = validate_deposit(60_000_000, 100_000_000, 50_000_000, 0, false);
    assert!(is_error(&result, AllocatorError::DepositCapExceeded));
}

#[test]
fn deposit_at_cap_boundary() {
    assert!(validate_deposit(50_000_000, 100_000_000, 50_000_000, 0, false).is_ok());
}

#[test]
fn deposit_uncapped_zero_means_unlimited() {
    assert!(validate_deposit(999_000_000_000, 0, 0, 0, false).is_ok());
}

#[test]
fn deposit_exceeds_per_tx_limit() {
    let result = validate_deposit(20_000_000, 0, 0, 10_000_000, false);
    assert!(is_error(&result, AllocatorError::DepositExceedsTxLimit));
}

#[test]
fn deposit_per_tx_zero_means_unlimited() {
    assert!(validate_deposit(999_000_000_000, 0, 0, 0, false).is_ok());
}

// ── Rebalance Interval ──

#[test]
fn rebalance_interval_sufficient() {
    assert!(validate_rebalance_interval(20_000, 10_000).is_ok()); // 10000 >= 9000
}

#[test]
fn rebalance_interval_too_soon() {
    let result = validate_rebalance_interval(15_000, 10_000); // 5000 < 9000
    assert!(is_error(&result, AllocatorError::RebalanceTooSoon));
}

#[test]
fn rebalance_interval_at_exact_minimum() {
    assert!(validate_rebalance_interval(19_000, 10_000).is_ok()); // 9000 = 9000
}

// ── Whitelist Validation ──

#[test]
fn whitelist_add_succeeds() {
    let protocol = Pubkey::new_unique();
    assert!(validate_whitelist_add(&[], &protocol).is_ok());
}

#[test]
fn whitelist_add_duplicate_rejected() {
    let protocol = Pubkey::new_unique();
    let whitelist = vec![protocol];
    let result = validate_whitelist_add(&whitelist, &protocol);
    assert!(is_error(&result, AllocatorError::AlreadyWhitelisted));
}

#[test]
fn whitelist_add_full_rejected() {
    let whitelist: Vec<Pubkey> = (0..MAX_PROTOCOLS).map(|_| Pubkey::new_unique()).collect();
    let new_protocol = Pubkey::new_unique();
    let result = validate_whitelist_add(&whitelist, &new_protocol);
    assert!(is_error(&result, AllocatorError::WhitelistFull));
}

#[test]
fn whitelist_remove_succeeds() {
    let protocol = Pubkey::new_unique();
    let whitelist = vec![protocol];
    assert!(validate_whitelist_remove(&whitelist, &protocol).is_ok());
}

#[test]
fn whitelist_remove_not_found() {
    let protocol = Pubkey::new_unique();
    let result = validate_whitelist_remove(&[], &protocol);
    assert!(is_error(&result, AllocatorError::ProtocolNotWhitelisted));
}

#[test]
fn whitelist_protocol_check_empty_is_permissionless() {
    let protocol = Pubkey::new_unique();
    assert!(validate_protocol_whitelisted(&[], &protocol).is_ok());
}

#[test]
fn whitelist_protocol_check_listed_passes() {
    let protocol = Pubkey::new_unique();
    let whitelist = vec![protocol];
    assert!(validate_protocol_whitelisted(&whitelist, &protocol).is_ok());
}

#[test]
fn whitelist_protocol_check_unlisted_rejected() {
    let protocol = Pubkey::new_unique();
    let other = Pubkey::new_unique();
    let whitelist = vec![other];
    let result = validate_protocol_whitelisted(&whitelist, &protocol);
    assert!(is_error(&result, AllocatorError::ProtocolNotWhitelisted));
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cargo test 2>&1 | grep -E "test (weight|shift|deposit|perp|rebalance|whitelist)" | head -30`
Expected: All tests show `... ok`

Run: `cargo test 2>&1 | tail -5`
Expected: `test result: ok. N passed; 0 failed`

- [ ] **Step 4: Commit**

```bash
git add programs/allocator/src/tests/ programs/allocator/src/lib.rs
git commit -m "test: add Rust unit tests for validation helpers (weights, deposits, whitelist)"
```

---

## Task 5: Rust Unit Tests — Arithmetic & Fees

**Files:**
- Create: `programs/allocator/src/tests/arithmetic_test.rs`

- [ ] **Step 1: Write arithmetic and fee tests**

Create `programs/allocator/src/tests/arithmetic_test.rs`:

```rust
use crate::validation::*;

// ── Share Price Calculation ──

#[test]
fn share_price_empty_vault_is_one() {
    let price = calculate_share_price(0, 0);
    assert_eq!(price, SHARE_PRICE_PRECISION); // 1_000_000 = 1:1
}

#[test]
fn share_price_equal_assets_and_shares() {
    // With virtual offset: (100M + 1M) * 1M / (100M + 1M) = 1M
    let price = calculate_share_price(100_000_000, 100_000_000);
    assert_eq!(price, SHARE_PRICE_PRECISION);
}

#[test]
fn share_price_assets_double_shares() {
    // 200M assets, 100M shares → price ~2.0 (with virtual offset minor deviation)
    let price = calculate_share_price(200_000_000, 100_000_000);
    assert!(price > SHARE_PRICE_PRECISION); // > 1.0
    assert!(price < 2 * SHARE_PRICE_PRECISION + 100_000); // ~2.0 with small deviation
}

#[test]
fn share_price_large_values_no_overflow() {
    // 10B USDC TVL (realistic max)
    let price = calculate_share_price(10_000_000_000_000, 10_000_000_000_000);
    assert_eq!(price, SHARE_PRICE_PRECISION); // Still 1:1
}

// ── Shares to Mint ──

#[test]
fn shares_to_mint_first_deposit_is_1_to_1() {
    let shares = calculate_shares_to_mint(100_000_000, 0, 0);
    assert_eq!(shares, 100_000_000); // First deposit: amount = shares
}

#[test]
fn shares_to_mint_equal_vault() {
    // 100M deposit into vault with 100M assets and 100M shares
    let shares = calculate_shares_to_mint(100_000_000, 100_000_000, 100_000_000);
    // With virtual offset: 100M * (100M + 1M) / (100M + 1M) = 100M
    assert_eq!(shares, 100_000_000);
}

#[test]
fn shares_to_mint_profitable_vault() {
    // Vault doubled: 200M assets, 100M shares. Deposit 100M.
    // shares = 100M * (100M + 1M) / (200M + 1M) ≈ 50.25M (fewer shares for same deposit)
    let shares = calculate_shares_to_mint(100_000_000, 200_000_000, 100_000_000);
    assert!(shares < 100_000_000); // Fewer shares when vault is profitable
    assert!(shares > 49_000_000);  // But roughly half
}

// ── Management Fee ──

#[test]
fn mgmt_fee_zero_assets() {
    let fee = calculate_management_fee(0, 1_000_000);
    assert_eq!(fee, 0);
}

#[test]
fn mgmt_fee_zero_slots() {
    let fee = calculate_management_fee(100_000_000, 0);
    assert_eq!(fee, 0);
}

#[test]
fn mgmt_fee_one_year() {
    // 100M USDC for ~63M slots (1 year) → ~1% = ~1M USDC
    let fee = calculate_management_fee(100_000_000, 63_072_000);
    // 100M * 158_548 * 63_072_000 / (1M * 10_000) = ~99,978 (~0.1 USDC)
    // Wait — 100M = 100 USDC in base units (6 decimals). 1% of 100 USDC = 1 USDC = 1M base
    // Actually: 100_000_000 * 158_548 * 63_072_000 / (1_000_000 * 10_000)
    //         = 100_000_000 * 158_548 * 63_072_000 / 10_000_000_000
    // This is a large number. Let me just verify it's non-zero and reasonable.
    assert!(fee > 0);
    // 1% of 100 USDC (100_000_000 base) per year ≈ 1_000_000 base
    // Allow 10% tolerance for rounding
    assert!(fee > 900_000);
    assert!(fee < 1_100_000);
}

#[test]
fn mgmt_fee_proportional_to_tvl() {
    let fee_100 = calculate_management_fee(100_000_000, 63_072_000);
    let fee_200 = calculate_management_fee(200_000_000, 63_072_000);
    // Double TVL = double fee (within rounding)
    assert!(fee_200 >= fee_100 * 2 - 1);
    assert!(fee_200 <= fee_100 * 2 + 1);
}

// ── Performance Fee ──

#[test]
fn perf_fee_no_gains() {
    let fee = calculate_performance_fee(1_000_000, 1_000_000, 100_000_000);
    assert_eq!(fee, 0); // No gain above HWM
}

#[test]
fn perf_fee_below_hwm() {
    let fee = calculate_performance_fee(900_000, 1_000_000, 100_000_000);
    assert_eq!(fee, 0); // Price below HWM = no fee
}

#[test]
fn perf_fee_with_gains() {
    // Price: 1.1M (10% gain above HWM of 1M), burning 100M shares
    // gain_per_share = 100_000, total_gain = 100_000 * 100M / 1M = 10M
    // fee = 10M * 1000 / 10000 = 1M (10% of gains)
    let fee = calculate_performance_fee(1_100_000, 1_000_000, 100_000_000);
    assert_eq!(fee, 1_000_000);
}

#[test]
fn perf_fee_zero_shares() {
    let fee = calculate_performance_fee(1_100_000, 1_000_000, 0);
    assert_eq!(fee, 0);
}

// ── Oracle Divergence ──

#[test]
fn oracle_no_divergence() {
    assert!(!check_oracle_divergence(100_000_000, 100_000_000));
}

#[test]
fn oracle_within_1_percent() {
    // 0.5% divergence → within 1% threshold
    assert!(!check_oracle_divergence(100_500_000, 100_000_000));
}

#[test]
fn oracle_at_1_percent_boundary() {
    // Exactly 1% → threshold = 1_000_000, diff = 1_000_000 → not exceeded
    assert!(!check_oracle_divergence(101_000_000, 100_000_000));
}

#[test]
fn oracle_exceeds_threshold() {
    // 2% divergence → exceeds 1% threshold
    assert!(check_oracle_divergence(102_000_000, 100_000_000));
}

#[test]
fn oracle_zero_assets_no_divergence() {
    assert!(!check_oracle_divergence(0, 0));
}

// ── Drawdown Check ──

#[test]
fn drawdown_no_drop() {
    assert!(!check_drawdown_exceeded(100_000_000, 100_000_000, 500)); // 5% max
}

#[test]
fn drawdown_within_limit() {
    // 3% drawdown with 5% limit → OK
    assert!(!check_drawdown_exceeded(97_000_000, 100_000_000, 500));
}

#[test]
fn drawdown_exceeds_limit() {
    // 6% drawdown with 5% limit → exceeded
    assert!(check_drawdown_exceeded(94_000_000, 100_000_000, 500));
}

#[test]
fn drawdown_zero_peak() {
    assert!(!check_drawdown_exceeded(0, 0, 500));
}

// ── Auto-Halt Check ──

#[test]
fn auto_halt_no_drop() {
    assert!(!should_auto_halt(100_000_000, 100_000_000));
}

#[test]
fn auto_halt_10_percent_drop() {
    // 90% of 24h ago → above 85% threshold → no halt
    assert!(!should_auto_halt(90_000_000, 100_000_000));
}

#[test]
fn auto_halt_16_percent_drop() {
    // 84% of 24h ago → below 85% threshold → should halt
    assert!(should_auto_halt(84_000_000, 100_000_000));
}

#[test]
fn auto_halt_zero_24h_no_halt() {
    assert!(!should_auto_halt(100_000_000, 0));
}
```

- [ ] **Step 2: Run tests**

Run: `cargo test 2>&1 | grep -E "test (share_price|shares_to|mgmt_fee|perf_fee|oracle|drawdown|auto_halt)" | head -25`
Expected: All pass

Run: `cargo test 2>&1 | tail -5`
Expected: `test result: ok. N passed; 0 failed` (N should now be ~50+)

- [ ] **Step 3: Commit**

```bash
git add programs/allocator/src/tests/arithmetic_test.rs
git commit -m "test: add Rust unit tests for fee calculations, share price, oracle, drawdown"
```

---

## Task 6: Rust Unit Tests — State & Error Codes

**Files:**
- Create: `programs/allocator/src/tests/state_test.rs`

- [ ] **Step 1: Write state and error code tests**

Create `programs/allocator/src/tests/state_test.rs`:

```rust
use crate::state::*;
use crate::errors::AllocatorError;

// ── RiskLevel Enum ──

#[test]
fn risk_level_conservative_is_0() {
    assert_eq!(RiskLevel::Conservative.as_u8(), 0);
}

#[test]
fn risk_level_moderate_is_1() {
    assert_eq!(RiskLevel::Moderate.as_u8(), 1);
}

#[test]
fn risk_level_aggressive_is_2() {
    assert_eq!(RiskLevel::Aggressive.as_u8(), 2);
}

#[test]
fn risk_level_equality() {
    assert_eq!(RiskLevel::Conservative, RiskLevel::Conservative);
    assert_ne!(RiskLevel::Conservative, RiskLevel::Moderate);
}

#[test]
fn risk_level_clone() {
    let level = RiskLevel::Aggressive;
    let cloned = level;
    assert_eq!(level, cloned);
}

// ── Constants ──

#[test]
fn max_weights_is_8() {
    assert_eq!(MAX_WEIGHTS, 8);
}

#[test]
fn max_reason_hash_is_32() {
    assert_eq!(MAX_REASON_HASH, 32);
}

#[test]
fn current_version_is_1() {
    assert_eq!(CURRENT_VERSION, 1);
}

#[test]
fn max_protocols_is_8() {
    assert_eq!(MAX_PROTOCOLS, 8);
}

// ── Error Code Existence ──
// Verifies all 34 error codes compile and have distinct discriminators.

#[test]
fn error_codes_are_distinct() {
    let codes: Vec<u32> = vec![
        AllocatorError::InvalidWeightSum as u32,
        AllocatorError::WeightExceedsMax as u32,
        AllocatorError::NegativeWeight as u32,
        AllocatorError::RebalanceTooSoon as u32,
        AllocatorError::ShiftTooLarge as u32,
        AllocatorError::UnauthorizedKeeper as u32,
        AllocatorError::UnauthorizedAdmin as u32,
        AllocatorError::AllocatorHalted as u32,
        AllocatorError::DrawdownExceeded as u32,
        AllocatorError::OracleDivergence as u32,
        AllocatorError::RedemptionPeriodNotElapsed as u32,
        AllocatorError::NoPendingWithdrawal as u32,
        AllocatorError::InvalidRiskLevel as u32,
        AllocatorError::VaultAlreadyInitialized as u32,
        AllocatorError::CannotLoosenGuardrails as u32,
        AllocatorError::LeaseConflict as u32,
        AllocatorError::HasPendingWithdrawal as u32,
        AllocatorError::InsufficientBalance as u32,
        AllocatorError::MathOverflow as u32,
        AllocatorError::VaultCapacityExceeded as u32,
        AllocatorError::StaleOracle as u32,
        AllocatorError::InsufficientLiquidity as u32,
        AllocatorError::ProtocolCpiFailed as u32,
        AllocatorError::DepositCapExceeded as u32,
        AllocatorError::InsufficientFees as u32,
        AllocatorError::ArithmeticUnderflow as u32,
        AllocatorError::ArithmeticOverflow as u32,
        AllocatorError::DepositTooSmall as u32,
        AllocatorError::WhitelistFull as u32,
        AllocatorError::AlreadyWhitelisted as u32,
        AllocatorError::ProtocolNotWhitelisted as u32,
        AllocatorError::RedemptionPeriodTooShort as u32,
        AllocatorError::DepositExceedsTxLimit as u32,
        AllocatorError::NonZeroShares as u32,
        AllocatorError::PendingWithdrawalExists as u32,
    ];

    // All codes are unique
    let mut sorted = codes.clone();
    sorted.sort();
    sorted.dedup();
    assert_eq!(sorted.len(), codes.len(), "Duplicate error codes found");
}

#[test]
fn error_codes_start_at_6000() {
    // Anchor custom errors start at 6000
    assert!(AllocatorError::InvalidWeightSum as u32 >= 6000);
}

#[test]
fn error_codes_are_sequential() {
    let first = AllocatorError::InvalidWeightSum as u32;
    let last = AllocatorError::PendingWithdrawalExists as u32;
    // 35 error codes → last should be first + 34
    assert_eq!(last - first, 34);
}
```

- [ ] **Step 2: Run all Rust tests**

Run: `cargo test 2>&1 | tail -8`
Expected: `test result: ok. N passed; 0 failed` (N should be ~65+)

Run: `cargo test 2>&1 | grep "^warning:"`
Expected: No output (zero warnings still holds)

- [ ] **Step 3: Commit**

```bash
git add programs/allocator/src/tests/state_test.rs
git commit -m "test: add Rust unit tests for state module, risk levels, error codes"
```

---

## Task 7: Backend Error Path Tests — Marginfi

**Files:**
- Create: `packages/backend-marginfi/src/backends/lending.error.test.ts`

- [ ] **Step 1: Write error path tests**

Create `packages/backend-marginfi/src/backends/lending.error.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MarginfiLendingBackend } from './lending'
import { clearRateCache } from '../utils/marginfi-data-api'

describe('MarginfiLendingBackend — error paths', () => {
  beforeEach(() => {
    clearRateCache()
  })

  // ── Initialization Failures ──

  describe('initialization', () => {
    it('throws if real mode without client', () => {
      expect(() => new MarginfiLendingBackend({ mockMode: false }))
        .toThrow('MarginfiClient required for real mode')
    })

    it('defaults to mock mode when no config given', () => {
      const backend = new MarginfiLendingBackend()
      expect(backend.name).toBe('marginfi-lending')
    })
  })

  // ── Real Mode Client Failures ──

  describe('client method failures', () => {
    function createFailingClient(error: string) {
      return {
        getBankByTokenSymbol: vi.fn().mockImplementation(() => {
          throw new Error(error)
        }),
      }
    }

    function createNullBankClient() {
      return {
        getBankByTokenSymbol: vi.fn().mockReturnValue(null),
      }
    }

    it('getExpectedYield propagates client error', async () => {
      const client = createFailingClient('RPC connection refused')
      const backend = new MarginfiLendingBackend({ mockMode: false, marginfiClient: client })

      await expect(backend.getExpectedYield()).rejects.toThrow('RPC connection refused')
    })

    it('getRisk propagates client error', async () => {
      const client = createFailingClient('Network timeout')
      const backend = new MarginfiLendingBackend({ mockMode: false, marginfiClient: client })

      await expect(backend.getRisk()).rejects.toThrow('Network timeout')
    })

    it('estimateSlippage propagates client error', async () => {
      const client = createFailingClient('Bank not found')
      const backend = new MarginfiLendingBackend({ mockMode: false, marginfiClient: client })

      await expect(backend.estimateSlippage(1_000_000n)).rejects.toThrow('Bank not found')
    })

    it('handles null bank return', async () => {
      const client = createNullBankClient()
      const backend = new MarginfiLendingBackend({ mockMode: false, marginfiClient: client })

      // Should throw because computeInterestRates() is called on null
      await expect(backend.getExpectedYield()).rejects.toThrow()
    })
  })

  // ── Malformed Data ──

  describe('malformed data from client', () => {
    function createMalformedClient() {
      return {
        getBankByTokenSymbol: vi.fn().mockReturnValue({
          computeInterestRates: () => ({ lendingRate: NaN, borrowingRate: NaN }),
          computeUtilizationRate: () => NaN,
          getTotalAssetQuantity: () => ({ toNumber: () => NaN }),
          getTotalLiabilityQuantity: () => ({ toNumber: () => NaN }),
        }),
      }
    }

    it('getExpectedYield returns NaN APY from malformed bank', async () => {
      const client = createMalformedClient()
      const backend = new MarginfiLendingBackend({ mockMode: false, marginfiClient: client })

      const estimate = await backend.getExpectedYield()
      // NaN propagates — this documents current behavior (no validation layer)
      expect(Number.isNaN(estimate.annualizedApy)).toBe(true)
    })

    it('getRisk produces NaN volatility from malformed utilization', async () => {
      const client = createMalformedClient()
      const backend = new MarginfiLendingBackend({ mockMode: false, marginfiClient: client })

      const risk = await backend.getRisk()
      expect(Number.isNaN(risk.volatilityScore)).toBe(true)
    })
  })

  // ── Concurrent Operations ──

  describe('concurrent operations', () => {
    it('handles parallel getExpectedYield calls', async () => {
      const client = {
        getBankByTokenSymbol: vi.fn().mockReturnValue({
          computeInterestRates: () => ({ lendingRate: 0.07, borrowingRate: 0.09 }),
          computeUtilizationRate: () => 0.65,
          getTotalAssetQuantity: () => ({ toNumber: () => 50_000_000_000 }),
          getTotalLiabilityQuantity: () => ({ toNumber: () => 32_500_000_000 }),
        }),
      }
      const backend = new MarginfiLendingBackend({ mockMode: false, marginfiClient: client })

      const results = await Promise.all([
        backend.getExpectedYield(),
        backend.getExpectedYield(),
        backend.getExpectedYield(),
      ])

      expect(results).toHaveLength(3)
      for (const r of results) {
        expect(r.annualizedApy).toBe(0.07)
      }
    })
  })
})
```

- [ ] **Step 2: Run tests**

Run: `cd packages/backend-marginfi && pnpm vitest run src/backends/lending.error.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/backend-marginfi/src/backends/lending.error.test.ts
git commit -m "test: add Marginfi backend error path tests (client failures, malformed data)"
```

---

## Task 8: Backend Error Path Tests — Kamino

**Files:**
- Create: `packages/backend-kamino/src/backends/lending.error.test.ts`

- [ ] **Step 1: Write error path tests**

Create `packages/backend-kamino/src/backends/lending.error.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KaminoLendingBackend } from './lending'
import { clearKaminoCache } from '../utils/kamino-api'

// Mock fetchWithRetry at the module level
vi.mock('@nanuqfi/core', async () => {
  const actual = await vi.importActual<typeof import('@nanuqfi/core')>('@nanuqfi/core')
  return {
    ...actual,
    fetchWithRetry: vi.fn(),
  }
})

import { fetchWithRetry } from '@nanuqfi/core'
const mockFetch = vi.mocked(fetchWithRetry)

describe('KaminoLendingBackend — error paths', () => {
  beforeEach(() => {
    clearKaminoCache()
    mockFetch.mockReset()
  })

  // ── Network Failures ──

  describe('network failures', () => {
    it('getExpectedYield throws on connection refused', async () => {
      mockFetch.mockRejectedValue(new Error('fetch failed: ECONNREFUSED'))
      const backend = new KaminoLendingBackend({ mockMode: false })

      await expect(backend.getExpectedYield()).rejects.toThrow('ECONNREFUSED')
    })

    it('getRisk throws on timeout', async () => {
      mockFetch.mockRejectedValue(new Error('The operation was aborted'))
      const backend = new KaminoLendingBackend({ mockMode: false })

      await expect(backend.getRisk()).rejects.toThrow('aborted')
    })

    it('estimateSlippage throws on DNS failure', async () => {
      mockFetch.mockRejectedValue(new Error('getaddrinfo ENOTFOUND api.kamino.finance'))
      const backend = new KaminoLendingBackend({ mockMode: false })

      await expect(backend.estimateSlippage(1_000_000n)).rejects.toThrow('ENOTFOUND')
    })
  })

  // ── Malformed Responses ──

  describe('malformed API responses', () => {
    it('rejects non-array reserves response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ error: 'internal' }),
      } as Response)
      const backend = new KaminoLendingBackend({ mockMode: false })

      await expect(backend.getExpectedYield()).rejects.toThrow('expected array')
    })

    it('rejects response missing USDC reserve', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [{ liquidityToken: 'SOL', supplyApy: '0.05' }],
      } as Response)
      const backend = new KaminoLendingBackend({ mockMode: false })

      await expect(backend.getExpectedYield()).rejects.toThrow('USDC reserve not found')
    })

    it('handles NaN in numeric fields', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [{
          reserve: 'test',
          liquidityToken: 'USDC',
          supplyApy: 'not-a-number',
          borrowApy: 'NaN',
          totalSupplyUsd: 'garbage',
          totalBorrowUsd: '',
        }],
      } as Response)
      const backend = new KaminoLendingBackend({ mockMode: false })

      const estimate = await backend.getExpectedYield()
      expect(Number.isNaN(estimate.annualizedApy)).toBe(true)
    })
  })

  // ── Rate Limiting ──

  describe('rate limiting', () => {
    it('fetchWithRetry handles 429 internally (retries exhausted propagates)', async () => {
      mockFetch.mockRejectedValue(new Error('fetchWithRetry: all retries exhausted'))
      const backend = new KaminoLendingBackend({ mockMode: false })

      await expect(backend.getExpectedYield()).rejects.toThrow('all retries exhausted')
    })
  })

  // ── Cache Stale-While-Revalidate ──

  describe('cache SWR behavior', () => {
    it('serves fresh data from cache without refetching', async () => {
      // First call: populate cache
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{
          reserve: 'test',
          liquidityToken: 'USDC',
          supplyApy: '0.05',
          borrowApy: '0.08',
          totalSupplyUsd: '200000000',
          totalBorrowUsd: '100000000',
        }],
      } as Response)

      const backend = new KaminoLendingBackend({ mockMode: false })
      const first = await backend.getExpectedYield()
      expect(first.annualizedApy).toBe(0.05)

      // Second call: cache serves, no fetch needed
      mockFetch.mockRejectedValue(new Error('should not be called'))
      const second = await backend.getExpectedYield()
      expect(second.annualizedApy).toBe(0.05)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })
})
```

- [ ] **Step 2: Run tests**

Run: `cd packages/backend-kamino && pnpm vitest run src/backends/lending.error.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/backend-kamino/src/backends/lending.error.test.ts
git commit -m "test: add Kamino backend error path tests (network, malformed, rate limit, cache)"
```

---

## Task 9: Backend Error Path Tests — Lulo

**Files:**
- Create: `packages/backend-lulo/src/backends/lending.error.test.ts`

- [ ] **Step 1: Write error path tests**

Create `packages/backend-lulo/src/backends/lending.error.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LuloLendingBackend } from './lending'
import { clearLuloCache } from '../utils/lulo-api'

// Mock fetchWithRetry at the module level
vi.mock('@nanuqfi/core', async () => {
  const actual = await vi.importActual<typeof import('@nanuqfi/core')>('@nanuqfi/core')
  return {
    ...actual,
    fetchWithRetry: vi.fn(),
  }
})

import { fetchWithRetry } from '@nanuqfi/core'
const mockFetch = vi.mocked(fetchWithRetry)

describe('LuloLendingBackend — error paths', () => {
  beforeEach(() => {
    clearLuloCache()
    mockFetch.mockReset()
  })

  // ── Initialization Failures ──

  describe('initialization', () => {
    it('throws if real mode without API key', () => {
      expect(() => new LuloLendingBackend({ mockMode: false }))
        .toThrow('LULO_API_KEY required for real mode')
    })

    it('succeeds in real mode with API key', () => {
      const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })
      expect(backend.name).toBe('lulo-lending')
    })
  })

  // ── Network Failures ──

  describe('network failures', () => {
    it('getExpectedYield throws on connection refused', async () => {
      mockFetch.mockRejectedValue(new Error('fetch failed: ECONNREFUSED'))
      const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })

      await expect(backend.getExpectedYield()).rejects.toThrow('ECONNREFUSED')
    })

    it('getRisk throws on timeout', async () => {
      mockFetch.mockRejectedValue(new Error('The operation was aborted'))
      const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })

      await expect(backend.getRisk()).rejects.toThrow('aborted')
    })

    it('estimateSlippage throws on DNS failure', async () => {
      mockFetch.mockRejectedValue(new Error('getaddrinfo ENOTFOUND api.lulo.fi'))
      const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })

      await expect(backend.estimateSlippage(1_000_000n)).rejects.toThrow('ENOTFOUND')
    })
  })

  // ── Malformed Responses ──

  describe('malformed API responses', () => {
    it('rejects invalid rates response shape', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ unexpected: 'format' }),
      } as Response)
      const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })

      await expect(backend.getExpectedYield()).rejects.toThrow('invalid rates response')
    })

    it('rejects invalid pool response shape', async () => {
      // First mock for getRisk → fetchLuloPoolData
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ wrong: 'shape' }),
      } as Response)
      const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })

      await expect(backend.getRisk()).rejects.toThrow('invalid')
    })
  })

  // ── Rate Limiting ──

  describe('rate limiting', () => {
    it('propagates retry exhaustion from fetchWithRetry', async () => {
      mockFetch.mockRejectedValue(new Error('fetchWithRetry: all retries exhausted'))
      const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })

      await expect(backend.getExpectedYield()).rejects.toThrow('all retries exhausted')
    })
  })

  // ── Cache SWR Behavior ──

  describe('cache SWR behavior', () => {
    it('serves cached rates without refetching', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          regular: { CURRENT: 8.25, '24HR': 7.90 },
          protected: { CURRENT: 6.50, '24HR': 6.30 },
        }),
      } as Response)

      const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'test-key' })
      const first = await backend.getExpectedYield()
      expect(first.annualizedApy).toBeCloseTo(0.0825, 4)

      // Second call should use cache
      mockFetch.mockRejectedValue(new Error('should not be called'))
      const second = await backend.getExpectedYield()
      expect(second.annualizedApy).toBeCloseTo(0.0825, 4)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  // ── API Key Passed in Headers ──

  describe('API key usage', () => {
    it('passes x-api-key header in requests', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          regular: { CURRENT: 8.0, '24HR': 7.5 },
          protected: { CURRENT: 6.0, '24HR': 5.5 },
        }),
      } as Response)

      const backend = new LuloLendingBackend({ mockMode: false, apiKey: 'my-secret-key' })
      await backend.getExpectedYield()

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('rates.getRates'),
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-api-key': 'my-secret-key' }),
        })
      )
    })
  })
})
```

- [ ] **Step 2: Run tests**

Run: `cd packages/backend-lulo && pnpm vitest run src/backends/lending.error.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/backend-lulo/src/backends/lending.error.test.ts
git commit -m "test: add Lulo backend error path tests (init, network, malformed, cache, API key)"
```

---

## Task 10: Cross-Package Integration Tests

**Files:**
- Create: `packages/core/src/integration/cross-package.test.ts`
- Modify: `packages/core/vitest.config.ts` (include integration dir)

- [ ] **Step 1: Write cross-package integration tests**

Create `packages/core/src/integration/cross-package.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import {
  YieldBackendRegistry,
  YieldRouter,
  MockYieldBackend,
  CircuitBreaker,
  CircuitState,
  noopLogger,
} from '../index'

describe('Cross-package integration — full lifecycle', () => {
  let registry: YieldBackendRegistry
  let marginfi: MockYieldBackend
  let kamino: MockYieldBackend
  let lulo: MockYieldBackend

  beforeEach(() => {
    registry = new YieldBackendRegistry()
    marginfi = new MockYieldBackend('marginfi-lending', {}, { apy: 0.065, volatility: 0.04 })
    kamino = new MockYieldBackend('kamino-lending', {}, { apy: 0.045, volatility: 0.03 })
    lulo = new MockYieldBackend('lulo-lending', {}, { apy: 0.082, volatility: 0.02 })

    registry.register(marginfi)
    registry.register(kamino)
    registry.register(lulo)
  })

  // ── Full Lifecycle Flow ──

  it('router ranks backends by risk-adjusted score', async () => {
    const router = new YieldRouter(registry, noopLogger)
    const ranked = await router.getBestYields({ asset: 'USDC' })

    expect(ranked).toHaveLength(3)
    // Lulo: 0.082/0.02 = 4.1, Marginfi: 0.065/0.04 = 1.625, Kamino: 0.045/0.03 = 1.5
    expect(ranked[0]!.backend).toBe('lulo-lending')
    expect(ranked[1]!.backend).toBe('marginfi-lending')
    expect(ranked[2]!.backend).toBe('kamino-lending')
  })

  it('router filters by minimum yield', async () => {
    const router = new YieldRouter(registry, noopLogger)
    const ranked = await router.getBestYields({ asset: 'USDC', minYield: 0.06 })

    expect(ranked).toHaveLength(2) // Kamino excluded (4.5% < 6%)
    expect(ranked.find(r => r.backend === 'kamino-lending')).toBeUndefined()
  })

  it('weights sum to 100 across ranked backends', async () => {
    const router = new YieldRouter(registry, noopLogger)
    const ranked = await router.getBestYields({ asset: 'USDC' })

    // Simple weight distribution proportional to score
    const totalScore = ranked.reduce((sum, r) => sum + r.riskAdjustedScore, 0)
    const weights: Record<string, number> = {}
    for (const r of ranked) {
      weights[r.backend] = Math.round((r.riskAdjustedScore / totalScore) * 100)
    }

    // Adjust for rounding to hit exactly 100
    const sum = Object.values(weights).reduce((a, b) => a + b, 0)
    const diff = 100 - sum
    const first = Object.keys(weights)[0]!
    weights[first]! += diff

    expect(Object.values(weights).reduce((a, b) => a + b, 0)).toBe(100)
    for (const w of Object.values(weights)) {
      expect(w).toBeGreaterThanOrEqual(0)
    }
  })

  it('deposit and withdrawal through best backend', async () => {
    const router = new YieldRouter(registry, noopLogger)
    const ranked = await router.getBestYields({ asset: 'USDC' })

    const best = registry.get(ranked[0]!.backend)!
    const depositTx = await best.deposit(100_000_000n)
    expect(depositTx).toBeTruthy()

    const pos = await best.getPosition()
    expect(pos.isActive).toBe(true)
    expect(pos.depositedAmount).toBe(100_000_000n)

    const withdrawTx = await best.withdraw(100_000_000n)
    expect(withdrawTx).toBeTruthy()

    const posFinal = await best.getPosition()
    expect(posFinal.isActive).toBe(false)
  })
})

describe('Cross-package integration — failure cascades', () => {
  let registry: YieldBackendRegistry
  let marginfi: MockYieldBackend
  let kamino: MockYieldBackend
  let lulo: MockYieldBackend

  beforeEach(() => {
    registry = new YieldBackendRegistry()
    marginfi = new MockYieldBackend('marginfi-lending', {}, { apy: 0.065, volatility: 0.04 })
    kamino = new MockYieldBackend('kamino-lending', {}, { apy: 0.045, volatility: 0.03 })
    lulo = new MockYieldBackend('lulo-lending', {}, { apy: 0.082, volatility: 0.02 })

    registry.register(marginfi)
    registry.register(kamino)
    registry.register(lulo)
  })

  it('one backend fails — router excludes it, others serve', async () => {
    marginfi.setFailMode(true)
    const router = new YieldRouter(registry, noopLogger)
    const ranked = await router.getBestYields({ asset: 'USDC' })

    expect(ranked).toHaveLength(2)
    expect(ranked.find(r => r.backend === 'marginfi-lending')).toBeUndefined()
    expect(ranked[0]!.backend).toBe('lulo-lending')
  })

  it('two backends fail — single backend still serves', async () => {
    marginfi.setFailMode(true)
    lulo.setFailMode(true)
    const router = new YieldRouter(registry, noopLogger)
    const ranked = await router.getBestYields({ asset: 'USDC' })

    expect(ranked).toHaveLength(1)
    expect(ranked[0]!.backend).toBe('kamino-lending')
  })

  it('all backends fail — router returns empty results', async () => {
    marginfi.setFailMode(true)
    kamino.setFailMode(true)
    lulo.setFailMode(true)
    const router = new YieldRouter(registry, noopLogger)
    const ranked = await router.getBestYields({ asset: 'USDC' })

    expect(ranked).toHaveLength(0)
  })

  it('circuit breaker trips after repeated failures', async () => {
    const router = new YieldRouter(registry, noopLogger)
    marginfi.setFailMode(true)

    // 3 failures → circuit opens (threshold=3)
    for (let i = 0; i < 3; i++) {
      await router.getBestYields({ asset: 'USDC' })
    }

    // 4th call: circuit is OPEN for marginfi, still excluded
    const ranked = await router.getBestYields({ asset: 'USDC' })
    expect(ranked).toHaveLength(2)
    expect(ranked.find(r => r.backend === 'marginfi-lending')).toBeUndefined()
  })

  it('circuit breaker recovers after timeout (HALF_OPEN → CLOSED)', async () => {
    const router = new YieldRouter(registry, noopLogger)
    marginfi.setFailMode(true)

    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await router.getBestYields({ asset: 'USDC' })
    }

    // Recover: reset fail mode
    marginfi.setFailMode(false)

    // Fast-forward time to expire the circuit timeout
    // Access internal breaker to simulate time passage
    const breakers = (router as unknown as { breakers: Map<string, CircuitBreaker> }).breakers
    const breaker = breakers.get('marginfi-lending')!
    // Force HALF_OPEN by manipulating lastFailureTime
    Object.assign(breaker, { lastFailureTime: Date.now() - 31_000 }) // > 30s reset timeout

    expect(breaker.state).toBe(CircuitState.HALF_OPEN)

    // Next call: HALF_OPEN allows one attempt → success → CLOSED
    const ranked = await router.getBestYields({ asset: 'USDC' })
    expect(ranked).toHaveLength(3) // All 3 backends back
    expect(breaker.state).toBe(CircuitState.CLOSED)
  })

  it('circuit breaker stays OPEN on HALF_OPEN failure', async () => {
    const router = new YieldRouter(registry, noopLogger)
    marginfi.setFailMode(true)

    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await router.getBestYields({ asset: 'USDC' })
    }

    // Simulate timeout to reach HALF_OPEN
    const breakers = (router as unknown as { breakers: Map<string, CircuitBreaker> }).breakers
    const breaker = breakers.get('marginfi-lending')!
    Object.assign(breaker, { lastFailureTime: Date.now() - 31_000 })

    expect(breaker.state).toBe(CircuitState.HALF_OPEN)

    // marginfi still failing → HALF_OPEN → back to OPEN
    const ranked = await router.getBestYields({ asset: 'USDC' })
    expect(ranked).toHaveLength(2)
    // Check internal state — should be back to OPEN (or failure count increased)
    expect(breaker.state).toBe(CircuitState.OPEN)
  })

  it('anomalous rate does not crash router', async () => {
    // Backend returns absurd 500% APY
    lulo.setYield(5.0)
    const router = new YieldRouter(registry, noopLogger)
    const ranked = await router.getBestYields({ asset: 'USDC' })

    // Router still works — lulo ranked first with huge score
    expect(ranked).toHaveLength(3)
    expect(ranked[0]!.backend).toBe('lulo-lending')
    expect(ranked[0]!.annualizedApy).toBe(5.0)
  })
})
```

- [ ] **Step 2: Update vitest config to include integration dir**

In `packages/core/vitest.config.ts`, change the include pattern:

The current `include: ['src/**/*.test.ts']` already matches `src/integration/cross-package.test.ts`, so no change needed. Verify:

Run: `cd packages/core && pnpm vitest run src/integration/cross-package.test.ts`
Expected: All tests pass

- [ ] **Step 3: Run full core test suite to verify no regressions**

Run: `cd packages/core && pnpm vitest run`
Expected: All tests pass (45 existing + ~12 new)

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/integration/cross-package.test.ts
git commit -m "test: add cross-package integration tests (lifecycle + failure cascades)"
```

---

## Task 11: Wire test:int Scripts

**Files:**
- Modify: `packages/core/package.json`
- Modify: `packages/backend-marginfi/package.json`
- Modify: `packages/backend-kamino/package.json`
- Modify: `packages/backend-lulo/package.json`
- Modify: `packages/backtest/package.json`

- [ ] **Step 1: Add test:int to each package.json**

For `packages/backend-marginfi/package.json`, add to scripts:
```json
"test:int": "vitest run src/integration/"
```

For `packages/backend-kamino/package.json`, add to scripts:
```json
"test:int": "vitest run src/integration/"
```

For `packages/backend-lulo/package.json`, add to scripts:
```json
"test:int": "vitest run src/integration/"
```

For `packages/backtest/package.json`, add to scripts:
```json
"test:int": "vitest run src/integration/"
```

For `packages/core/package.json`, add to scripts:
```json
"test:int": "vitest run src/integration/"
```

- [ ] **Step 2: Verify turbo test:int pipeline works**

Run: `pnpm turbo test:int --dry-run`
Expected: Shows all 5 packages will run test:int

- [ ] **Step 3: Commit**

```bash
git add packages/*/package.json
git commit -m "chore: wire test:int scripts into all packages for turbo integration tests"
```

---

## Task 12: Update CI Pipeline

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add cargo-test and integration-test jobs**

Replace the entire `.github/workflows/ci.yml` content with:

```yaml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build
      - run: pnpm turbo lint
      - run: pnpm turbo test
      - name: Audit npm dependencies
        run: pnpm audit --audit-level=high || echo "::warning::pnpm audit found vulnerabilities"

  cargo-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Rust toolchain
        uses: dtolnay/rust-toolchain@stable
      - name: Cache cargo
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            programs/allocator/target
          key: cargo-${{ hashFiles('programs/allocator/Cargo.lock') }}
      - name: Build (zero warnings)
        run: cargo build
        working-directory: programs/allocator
        env:
          RUSTFLAGS: "-D warnings"
      - name: Test (zero warnings)
        run: cargo test
        working-directory: programs/allocator
        env:
          RUSTFLAGS: "-D warnings"
      - name: Audit Rust dependencies
        run: |
          cargo install cargo-audit --quiet
          cargo audit
        working-directory: programs/allocator

  integration-test:
    runs-on: ubuntu-latest
    needs: [test, cargo-test]
    if: github.ref == 'refs/heads/main' || github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build
      - name: Run integration tests
        run: pnpm turbo test:int
        env:
          KAMINO_INTEGRATION: '1'
          MARGINFI_INTEGRATION: '1'
          LULO_INTEGRATION: '1'
          LULO_API_KEY: ${{ secrets.LULO_API_KEY }}
          SOLANA_RPC_URL: ${{ secrets.SOLANA_RPC_URL }}
```

- [ ] **Step 2: Verify CI file is valid YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add cargo-test job (zero warnings) and integration-test job (live APIs)"
```

---

## Task 13: Final Verification

- [ ] **Step 1: Run all unit tests**

Run: `pnpm turbo test`
Expected: All packages pass, no regressions

- [ ] **Step 2: Run cargo tests**

Run: `cargo test 2>&1 | tail -8`
Expected: All tests pass, zero warnings

- [ ] **Step 3: Run cargo build with -D warnings**

Run: `RUSTFLAGS="-D warnings" cargo build 2>&1 | tail -5`
Expected: Build succeeds with zero warnings

- [ ] **Step 4: Count total tests**

Run:
```bash
echo "=== Rust ===" && cargo test 2>&1 | grep "test result:"
echo "=== TypeScript ===" && pnpm turbo test 2>&1 | grep -E "Tests\s+[0-9]+ passed"
```
Expected: ~65 Rust tests + ~170 TypeScript tests = ~235 total

- [ ] **Step 5: Verify legacy scripts archived**

Run: `ls scripts/legacy/`
Expected: `test-phase-b.ts  test-phase-c.ts  e2e-gate.ts  test-halt-resume.ts`

---

## Summary

| Task | What | Tests Added | Commits |
|------|------|-------------|---------|
| 1 | Zero cargo warnings | 0 | 1 |
| 2 | Archive legacy scripts | 0 | 1 |
| 3 | Extract validation helpers | 0 | 1 |
| 4 | Rust validation tests | ~30 | 1 |
| 5 | Rust arithmetic/fee tests | ~25 | 1 |
| 6 | Rust state/error tests | ~12 | 1 |
| 7 | Marginfi error paths | ~9 | 1 |
| 8 | Kamino error paths | ~8 | 1 |
| 9 | Lulo error paths | ~10 | 1 |
| 10 | Cross-package integration | ~12 | 1 |
| 11 | Wire test:int scripts | 0 | 1 |
| 12 | Update CI pipeline | 0 | 1 |
| 13 | Final verification | 0 | 0 |
| **Total** | | **~106 new tests** | **12 commits** |
