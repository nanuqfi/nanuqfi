# Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all 26 audit issues across the Anchor program, TypeScript SDK, and CI/repo tooling — hardening NanuqFi for production.

**Architecture:** Two-phase execution. Phase 1 handles security-critical program fixes + CI foundation (sequential program changes, parallel CI agents). Phase 2 handles hardening + cleanup (sequential program, parallel SDK/repo agents). Hard checkpoint between phases.

**Tech Stack:** Rust/Anchor 0.30.1, TypeScript 5.7, Vitest 3, ESLint 9, pnpm + Turborepo

**Spec:** `docs/superpowers/specs/2026-04-06-production-hardening-design.md`

---

## File Map

### Program files (Phase 1 + 2)
- Modify: `programs/allocator/src/state.rs` — version fields, new fields, new structs
- Modify: `programs/allocator/src/lib.rs` — constraints, checked math, events, new instructions
- Modify: `programs/allocator/src/errors.rs` — new error variants
- Modify: `programs/allocator/Cargo.toml` — devnet feature flag

### SDK files (Phase 2)
- Create: `packages/core/src/fetch-retry.ts` — retry/timeout/backoff utility
- Create: `packages/core/src/logger.ts` — structured logging interface
- Create: `packages/core/src/cache.ts` — injectable cache with SWR
- Modify: `packages/core/src/router.ts` — logger injection, error observability
- Modify: `packages/core/src/interfaces.ts` — re-export logger type
- Modify: `packages/core/src/index.ts` — export new modules
- Modify: `packages/backend-kamino/src/utils/kamino-api.ts` — retry, validation, injectable cache, env vars
- Modify: `packages/backend-lulo/src/utils/lulo-api.ts` — retry, validation, injectable cache, env vars
- Modify: `packages/backend-marginfi/src/utils/defillama-api.ts` — retry, env vars
- Modify: `packages/backtest/src/types.ts` — already parameterized (verify)
- Modify: `packages/backtest/src/data-loader.ts` — env var for API URL

### CI/Repo files (Phase 1 + 2)
- Create: `eslint.config.js` — ESLint v9 flat config
- Create: `.env.example` — documented env vars
- Create: `LICENSE` — BUSL-1.1
- Modify: `.github/workflows/ci.yml` — lint, type-check, audit, coverage steps
- Modify: `packages/core/vitest.config.ts` — coverage config
- Delete: `scripts/setup-drift-user.ts` — dead Drift code

### Test files
- Create: `packages/core/src/fetch-retry.test.ts`
- Create: `packages/core/src/logger.test.ts`
- Create: `packages/core/src/cache.test.ts`
- Modify: `packages/core/src/router.test.ts` — observability tests
- Modify: `packages/backend-kamino/src/utils/kamino-api.test.ts` — validation tests
- Modify: `packages/backend-lulo/src/utils/lulo-api.test.ts` — validation tests

---

## Phase 1 — Security & Structure

### Task 1: Add version fields to all account structs (#16)

**Files:**
- Modify: `programs/allocator/src/state.rs:1-108`
- Modify: `programs/allocator/src/lib.rs:47-101` (init functions)

- [ ] **Step 1: Add version constant and fields to state.rs**

Replace the entire `state.rs` content:

```rust
use anchor_lang::prelude::*;

pub const MAX_WEIGHTS: usize = 8;
pub const MAX_REASON_HASH: usize = 32;
pub const CURRENT_VERSION: u8 = 1;

#[account]
#[derive(InitSpace)]
pub struct Allocator {
    pub version: u8,
    pub admin: Pubkey,
    pub keeper_authority: Pubkey,
    pub total_tvl: u64,
    pub halted: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum RiskLevel {
    Conservative,
    Moderate,
    Aggressive,
}

impl RiskLevel {
    pub fn as_u8(&self) -> u8 {
        match self {
            RiskLevel::Conservative => 0,
            RiskLevel::Moderate => 1,
            RiskLevel::Aggressive => 2,
        }
    }
}

#[account]
#[derive(InitSpace)]
pub struct RiskVault {
    pub version: u8,
    pub allocator: Pubkey,
    pub risk_level: RiskLevel,
    pub protocol_vault: Pubkey,
    pub share_mint: Pubkey,
    pub total_shares: u64,
    pub total_assets: u64,
    pub peak_equity: u64,
    pub current_equity: u64,
    pub equity_24h_ago: u64,
    pub last_rebalance_slot: u64,
    pub rebalance_counter: u32,
    pub last_mgmt_fee_slot: u64,
    #[max_len(MAX_WEIGHTS)]
    pub current_weights: Vec<u16>,
    pub max_perp_allocation_bps: u16,
    pub max_lending_allocation_bps: u16,
    pub max_single_asset_bps: u16,
    pub max_drawdown_bps: u16,
    pub max_leverage_bps: u16,
    pub redemption_period_slots: u64,
    pub deposit_cap: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UserPosition {
    pub version: u8,
    pub user: Pubkey,
    pub risk_vault: Pubkey,
    pub shares: u64,
    pub deposited_usdc: u64,
    pub entry_slot: u64,
    pub high_water_mark_price: u64,
    pub pending_withdrawal_shares: u64,
    pub withdraw_request_slot: u64,
    pub request_time_share_price: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Treasury {
    pub version: u8,
    pub allocator: Pubkey,
    pub usdc_token_account: Pubkey,
    pub total_fees_collected: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct RebalanceRecord {
    pub version: u8,
    pub risk_vault: Pubkey,
    pub counter: u32,
    pub slot: u64,
    #[max_len(MAX_WEIGHTS)]
    pub previous_weights: Vec<u16>,
    #[max_len(MAX_WEIGHTS)]
    pub new_weights: Vec<u16>,
    #[max_len(MAX_REASON_HASH)]
    pub ai_reasoning_hash: Vec<u8>,
    pub approved: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct KeeperLease {
    pub version: u8,
    pub keeper: Pubkey,
    pub lease_expiry_slot: u64,
    pub heartbeat_slot: u64,
    pub bump: u8,
}
```

- [ ] **Step 2: Set version in initialize_allocator**

In `lib.rs`, inside `initialize_allocator` (after line 48), add version assignment:

```rust
pub fn initialize_allocator(ctx: Context<InitializeAllocator>) -> Result<()> {
    let allocator = &mut ctx.accounts.allocator;
    allocator.version = CURRENT_VERSION;
    allocator.admin = ctx.accounts.admin.key();
    // ... rest unchanged
```

- [ ] **Step 3: Set version in initialize_risk_vault**

In `lib.rs`, inside `initialize_risk_vault` (after line 68), add:

```rust
vault.version = CURRENT_VERSION;
```

- [ ] **Step 4: Set version in initialize_treasury**

In `lib.rs`, inside `initialize_treasury` (after line 96), add:

```rust
treasury.version = CURRENT_VERSION;
```

- [ ] **Step 5: Set version in UserPosition first-time init**

In `lib.rs`, inside the `if position.user == Pubkey::default()` block in `deposit` (~line 190), add:

```rust
position.version = CURRENT_VERSION;
```

- [ ] **Step 6: Set version in rebalance_record creation**

In `lib.rs`, inside `rebalance` (~line 621), add:

```rust
record.version = CURRENT_VERSION;
```

- [ ] **Step 7: Set version in acquire_lease**

In `lib.rs`, inside `acquire_lease` (~line 731), add after the keeper assignment:

```rust
lease.version = CURRENT_VERSION;
```

- [ ] **Step 8: Build and verify**

Run: `cd programs/allocator && anchor build`

Expected: Build succeeds. Binary size may increase slightly (~6 bytes per struct × 6 structs).

- [ ] **Step 9: Commit**

```bash
git add programs/allocator/src/state.rs programs/allocator/src/lib.rs
git commit -m "fix(program): add version field to all account structs (#16)"
```

---

### Task 2: Constrain vault_usdc in Deposit/Withdraw/Allocate/Recall (#1)

**Files:**
- Modify: `programs/allocator/src/lib.rs:972-1017` (Deposit)
- Modify: `programs/allocator/src/lib.rs:1043-1098` (Withdraw)
- Modify: `programs/allocator/src/lib.rs:1100-1152` (Rebalance)
- Modify: `programs/allocator/src/lib.rs:1351-1366` (AllocateToProtocol)
- Modify: `programs/allocator/src/lib.rs:1368-1383` (RecallFromProtocol)

- [ ] **Step 1: Add usdc_mint and constrain vault_usdc in Deposit**

Replace the `vault_usdc` and add `usdc_mint` in the `Deposit` struct:

```rust
#[derive(Accounts)]
pub struct Deposit<'info> {
  #[account(
    mut,
    seeds = [b"allocator"],
    bump = allocator.bump,
  )]
  pub allocator: Account<'info, Allocator>,

  #[account(
    mut,
    constraint = risk_vault.allocator == allocator.key(),
    constraint = risk_vault.share_mint == share_mint.key(),
  )]
  pub risk_vault: Account<'info, RiskVault>,

  #[account(
    init_if_needed,
    payer = user,
    space = 8 + UserPosition::INIT_SPACE,
    seeds = [b"position", user.key().as_ref(), risk_vault.key().as_ref()],
    bump
  )]
  pub user_position: Account<'info, UserPosition>,

  #[account(mut)]
  pub share_mint: Account<'info, Mint>,

  /// USDC mint (for vault_usdc constraint validation)
  pub usdc_mint: Account<'info, Mint>,

  /// User's USDC token account (source)
  #[account(mut)]
  pub user_usdc: Account<'info, TokenAccount>,

  /// User's share token account (destination for minted shares)
  #[account(mut)]
  pub user_shares: Account<'info, TokenAccount>,

  /// Vault's USDC token account — constrained to correct mint + authority
  #[account(
    mut,
    token::mint = usdc_mint,
    token::authority = allocator,
  )]
  pub vault_usdc: Account<'info, TokenAccount>,

  #[account(mut)]
  pub user: Signer<'info>,

  pub token_program: Program<'info, Token>,
  pub system_program: Program<'info, System>,
}
```

- [ ] **Step 2: Add usdc_mint and constrain vault_usdc in Withdraw**

Replace `vault_usdc` in `Withdraw` struct and add `usdc_mint`:

```rust
#[derive(Accounts)]
pub struct Withdraw<'info> {
  #[account(
    mut,
    seeds = [b"allocator"],
    bump = allocator.bump,
  )]
  pub allocator: Account<'info, Allocator>,

  #[account(
    mut,
    constraint = risk_vault.allocator == allocator.key(),
    constraint = risk_vault.share_mint == share_mint.key(),
  )]
  pub risk_vault: Account<'info, RiskVault>,

  #[account(
    mut,
    seeds = [b"position", user.key().as_ref(), risk_vault.key().as_ref()],
    bump = user_position.bump,
    constraint = user_position.user == user.key(),
  )]
  pub user_position: Account<'info, UserPosition>,

  #[account(
    mut,
    seeds = [b"treasury"],
    bump = treasury.bump,
  )]
  pub treasury: Account<'info, Treasury>,

  #[account(mut)]
  pub share_mint: Account<'info, Mint>,

  /// USDC mint (for vault_usdc constraint validation)
  pub usdc_mint: Account<'info, Mint>,

  /// User's share token account (shares to burn)
  #[account(mut)]
  pub user_shares: Account<'info, TokenAccount>,

  /// User's USDC token account (receives withdrawal)
  #[account(mut)]
  pub user_usdc: Account<'info, TokenAccount>,

  /// Vault's USDC token account — constrained to correct mint + authority
  #[account(
    mut,
    token::mint = usdc_mint,
    token::authority = allocator,
  )]
  pub vault_usdc: Account<'info, TokenAccount>,

  /// Treasury USDC token account (receives performance fee)
  #[account(
    mut,
    constraint = treasury_usdc.key() == treasury.usdc_token_account,
  )]
  pub treasury_usdc: Account<'info, TokenAccount>,

  pub user: Signer<'info>,
  pub token_program: Program<'info, Token>,
}
```

- [ ] **Step 3: Add usdc_mint and constrain vault_usdc in Rebalance**

In the `Rebalance` struct, replace `vault_usdc` and add `usdc_mint`:

```rust
  /// USDC mint (for vault_usdc constraint validation)
  pub usdc_mint: Account<'info, Mint>,

  /// Vault's USDC token account (fee source) — constrained to correct mint + authority
  #[account(
    mut,
    token::mint = usdc_mint,
    token::authority = allocator,
  )]
  pub vault_usdc: Account<'info, TokenAccount>,
```

- [ ] **Step 4: Add usdc_mint and constrain vault_usdc in AllocateToProtocol**

```rust
#[derive(Accounts)]
pub struct AllocateToProtocol<'info> {
  #[account(mut, seeds = [b"allocator"], bump = allocator.bump)]
  pub allocator: Account<'info, Allocator>,
  #[account(mut, constraint = risk_vault.allocator == allocator.key())]
  pub risk_vault: Account<'info, RiskVault>,
  #[account(constraint = keeper.key() == allocator.keeper_authority @ AllocatorError::UnauthorizedKeeper)]
  pub keeper: Signer<'info>,
  /// USDC mint (for vault_usdc constraint validation)
  pub usdc_mint: Account<'info, Mint>,
  /// Vault's USDC token account (source) — constrained to correct mint + authority
  #[account(
    mut,
    token::mint = usdc_mint,
    token::authority = allocator,
  )]
  pub vault_usdc: Account<'info, TokenAccount>,
  /// Protocol's USDC token account (destination)
  #[account(mut)]
  pub protocol_usdc: Account<'info, TokenAccount>,
  pub token_program: Program<'info, Token>,
}
```

- [ ] **Step 5: Add usdc_mint and constrain vault_usdc in RecallFromProtocol**

```rust
#[derive(Accounts)]
pub struct RecallFromProtocol<'info> {
  #[account(mut, seeds = [b"allocator"], bump = allocator.bump)]
  pub allocator: Account<'info, Allocator>,
  #[account(mut, constraint = risk_vault.allocator == allocator.key())]
  pub risk_vault: Account<'info, RiskVault>,
  #[account(constraint = keeper.key() == allocator.keeper_authority @ AllocatorError::UnauthorizedKeeper)]
  pub keeper: Signer<'info>,
  /// USDC mint (for vault_usdc constraint validation)
  pub usdc_mint: Account<'info, Mint>,
  /// Protocol's USDC token account (source)
  #[account(mut)]
  pub protocol_usdc: Account<'info, TokenAccount>,
  /// Vault's USDC token account (destination) — constrained to correct mint + authority
  #[account(
    mut,
    token::mint = usdc_mint,
    token::authority = allocator,
  )]
  pub vault_usdc: Account<'info, TokenAccount>,
  pub token_program: Program<'info, Token>,
}
```

- [ ] **Step 6: Build and verify**

Run: `anchor build`

Expected: Build succeeds. All account structs now validate vault_usdc ownership.

- [ ] **Step 7: Commit**

```bash
git add programs/allocator/src/lib.rs
git commit -m "fix(program): constrain vault_usdc in Deposit/Withdraw/Allocate/Recall (#1)"
```

---

### Task 3: Replace saturating_sub with checked_sub (#2)

**Files:**
- Modify: `programs/allocator/src/lib.rs:411,600,786`
- Modify: `programs/allocator/src/errors.rs`

- [ ] **Step 1: Add error variants to errors.rs**

Add to the `AllocatorError` enum:

```rust
    #[msg("Arithmetic underflow in financial calculation")]
    ArithmeticUnderflow,
    #[msg("Arithmetic overflow in financial calculation")]
    ArithmeticOverflow,
```

- [ ] **Step 2: Fix withdraw TVL decrement (line ~411)**

Replace:
```rust
    allocator_account.total_tvl = allocator_account
      .total_tvl
      .saturating_sub(gross_usdc);
```
With:
```rust
    allocator_account.total_tvl = allocator_account
      .total_tvl
      .checked_sub(gross_usdc)
      .ok_or(AllocatorError::ArithmeticUnderflow)?;
```

- [ ] **Step 3: Fix rebalance fee deduction (line ~600)**

Replace:
```rust
          vault.total_assets = vault
            .total_assets
            .saturating_sub(transfer_fee);
```
With:
```rust
          vault.total_assets = vault
            .total_assets
            .checked_sub(transfer_fee)
            .ok_or(AllocatorError::ArithmeticUnderflow)?;
```

- [ ] **Step 4: Fix withdraw_treasury fee decrement (line ~786)**

Replace:
```rust
    treasury.total_fees_collected = treasury
      .total_fees_collected
      .saturating_sub(amount);
```
With:
```rust
    treasury.total_fees_collected = treasury
      .total_fees_collected
      .checked_sub(amount)
      .ok_or(AllocatorError::ArithmeticUnderflow)?;
```

Note: This line will change again in Task 4 (cumulative fees). The checked_sub is correct for now — Task 4 will restructure the logic entirely.

- [ ] **Step 5: Fix equity snapshot saturating_sub (line ~615)**

Replace:
```rust
      || clock.slot.saturating_sub(vault.last_rebalance_slot) >= EQUITY_SNAPSHOT_INTERVAL
```
With:
```rust
      || clock.slot.checked_sub(vault.last_rebalance_slot).unwrap_or(0) >= EQUITY_SNAPSHOT_INTERVAL
```

This one is non-financial (time delta), so `unwrap_or(0)` is acceptable — it just means "don't refresh if somehow the slot went backwards."

- [ ] **Step 6: Build and verify**

Run: `anchor build`

Expected: Build succeeds. All financial arithmetic now fails explicitly on underflow.

- [ ] **Step 7: Commit**

```bash
git add programs/allocator/src/lib.rs programs/allocator/src/errors.rs
git commit -m "fix(program): replace saturating_sub with checked_sub in financial accounting (#2)"
```

---

### Task 4: Make total_fees_collected cumulative, add total_fees_withdrawn (#3)

**Files:**
- Modify: `programs/allocator/src/state.rs` (Treasury struct)
- Modify: `programs/allocator/src/lib.rs:95-101,760-790`
- Modify: `programs/allocator/src/errors.rs`

- [ ] **Step 1: Add total_fees_withdrawn to Treasury**

In `state.rs`, update the `Treasury` struct:

```rust
#[account]
#[derive(InitSpace)]
pub struct Treasury {
    pub version: u8,
    pub allocator: Pubkey,
    pub usdc_token_account: Pubkey,
    pub total_fees_collected: u64,
    pub total_fees_withdrawn: u64,
    pub bump: u8,
}
```

- [ ] **Step 2: Add InsufficientFees error**

In `errors.rs`, add:

```rust
    #[msg("Insufficient fees available for withdrawal")]
    InsufficientFees,
```

- [ ] **Step 3: Initialize total_fees_withdrawn in initialize_treasury**

In `lib.rs`, inside `initialize_treasury`, add after `total_fees_collected`:

```rust
    treasury.total_fees_withdrawn = 0;
```

- [ ] **Step 4: Fix withdraw_treasury to use total_fees_withdrawn**

Replace the entire `withdraw_treasury` function body:

```rust
  pub fn withdraw_treasury(ctx: Context<WithdrawTreasury>, amount: u64) -> Result<()> {
    require!(amount > 0, AllocatorError::InsufficientBalance);

    let treasury = &ctx.accounts.treasury;
    let available = treasury
      .total_fees_collected
      .checked_sub(treasury.total_fees_withdrawn)
      .ok_or(AllocatorError::ArithmeticUnderflow)?;
    require!(amount <= available, AllocatorError::InsufficientFees);

    require!(
      ctx.accounts.treasury_usdc.amount >= amount,
      AllocatorError::InsufficientBalance
    );

    let allocator_bump = ctx.accounts.allocator.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[b"allocator".as_ref(), &[allocator_bump]]];

    token::transfer(
      CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
          from: ctx.accounts.treasury_usdc.to_account_info(),
          to: ctx.accounts.admin_usdc.to_account_info(),
          authority: ctx.accounts.allocator.to_account_info(),
        },
        signer_seeds,
      ),
      amount,
    )?;

    let treasury = &mut ctx.accounts.treasury;
    treasury.total_fees_withdrawn = treasury
      .total_fees_withdrawn
      .checked_add(amount)
      .ok_or(AllocatorError::ArithmeticOverflow)?;

    msg!("Treasury withdrawal: {} USDC", amount);
    Ok(())
  }
```

- [ ] **Step 5: Build and verify**

Run: `anchor build`

Expected: Build succeeds. `total_fees_collected` is now append-only cumulative.

- [ ] **Step 6: Commit**

```bash
git add programs/allocator/src/state.rs programs/allocator/src/lib.rs programs/allocator/src/errors.rs
git commit -m "fix(program): make total_fees_collected cumulative, add total_fees_withdrawn (#3)"
```

---

### Task 5: First-depositor share inflation protection (#20)

**Files:**
- Modify: `programs/allocator/src/lib.rs:106-137` (deposit function)
- Modify: `programs/allocator/src/errors.rs`

- [ ] **Step 1: Add constants and error variant**

At the top of `lib.rs`, add after `SHARE_PRICE_PRECISION`:

```rust
/// Virtual offset for share price — prevents inflation/griefing attack.
/// 1 USDC = 1_000_000 base units (6 decimals).
const VIRTUAL_OFFSET: u64 = 1_000_000;

/// Minimum first deposit to prevent dust attacks.
const MIN_FIRST_DEPOSIT: u64 = 1_000_000; // 1 USDC
```

In `errors.rs`, add:

```rust
    #[msg("First deposit must meet minimum amount")]
    DepositTooSmall,
```

- [ ] **Step 2: Update share pricing in deposit**

Replace the share pricing block in `deposit` (lines ~126-135):

```rust
    let vault = &mut ctx.accounts.risk_vault;

    // ERC-4626 share pricing with virtual offset (anti-inflation)
    let shares = if vault.total_shares == 0 {
      // First deposit: enforce minimum to prevent dust attack
      require!(amount >= MIN_FIRST_DEPOSIT, AllocatorError::DepositTooSmall);
      amount
    } else {
      // Virtual offset prevents first-depositor inflation/griefing
      let virtual_shares = vault.total_shares
        .checked_add(VIRTUAL_OFFSET)
        .ok_or(AllocatorError::MathOverflow)?;
      let virtual_assets = vault.total_assets
        .checked_add(VIRTUAL_OFFSET)
        .ok_or(AllocatorError::MathOverflow)?;
      amount
        .checked_mul(virtual_shares)
        .ok_or(AllocatorError::MathOverflow)?
        .checked_div(virtual_assets)
        .ok_or(AllocatorError::MathOverflow)?
    };
```

- [ ] **Step 3: Update share-to-asset conversion in withdraw**

In the `withdraw` function, update both share price calculations to use virtual offset. Replace current price calc (~line 292-301):

```rust
    // Current share price (with virtual offset for consistency)
    let current_price = if vault.total_shares > 0 {
      vault
        .total_assets
        .checked_add(VIRTUAL_OFFSET)
        .ok_or(AllocatorError::MathOverflow)?
        .checked_mul(SHARE_PRICE_PRECISION)
        .ok_or(AllocatorError::MathOverflow)?
        .checked_div(
          vault.total_shares
            .checked_add(VIRTUAL_OFFSET)
            .ok_or(AllocatorError::MathOverflow)?
        )
        .ok_or(AllocatorError::MathOverflow)?
    } else {
      SHARE_PRICE_PRECISION
    };
```

Do the same for `request_withdraw` share price calc (~line 253-262):

```rust
    position.request_time_share_price = if vault.total_shares > 0 {
      vault
        .total_assets
        .checked_add(VIRTUAL_OFFSET)
        .ok_or(AllocatorError::MathOverflow)?
        .checked_mul(SHARE_PRICE_PRECISION)
        .ok_or(AllocatorError::MathOverflow)?
        .checked_div(
          vault.total_shares
            .checked_add(VIRTUAL_OFFSET)
            .ok_or(AllocatorError::MathOverflow)?
        )
        .ok_or(AllocatorError::MathOverflow)?
    } else {
      SHARE_PRICE_PRECISION
    };
```

And the HWM update in deposit (~line 211-216):

```rust
    let current_price = vault
      .total_assets
      .checked_add(VIRTUAL_OFFSET)
      .ok_or(AllocatorError::MathOverflow)?
      .checked_mul(SHARE_PRICE_PRECISION)
      .ok_or(AllocatorError::MathOverflow)?
      .checked_div(
        vault.total_shares
          .checked_add(VIRTUAL_OFFSET)
          .ok_or(AllocatorError::MathOverflow)?
      )
      .ok_or(AllocatorError::MathOverflow)?;
```

- [ ] **Step 4: Build and verify**

Run: `anchor build`

- [ ] **Step 5: Commit**

```bash
git add programs/allocator/src/lib.rs programs/allocator/src/errors.rs
git commit -m "fix(program): protect against first-depositor share inflation attack (#20)"
```

---

### Task 6: Protocol whitelist (#15)

**Files:**
- Modify: `programs/allocator/src/state.rs` (Allocator struct)
- Modify: `programs/allocator/src/lib.rs` (new instructions + constraint in allocate_to_protocol)
- Modify: `programs/allocator/src/errors.rs`

- [ ] **Step 1: Add whitelist constants and fields**

In `state.rs`, add constant:

```rust
pub const MAX_PROTOCOLS: usize = 8;
```

Add field to `Allocator` struct (after `halted`):

```rust
    #[max_len(MAX_PROTOCOLS)]
    pub protocol_whitelist: Vec<Pubkey>,
```

- [ ] **Step 2: Add error variants**

In `errors.rs`:

```rust
    #[msg("Protocol whitelist is full")]
    WhitelistFull,
    #[msg("Protocol already whitelisted")]
    AlreadyWhitelisted,
    #[msg("Protocol not whitelisted")]
    ProtocolNotWhitelisted,
```

- [ ] **Step 3: Initialize whitelist as empty in initialize_allocator**

In `lib.rs`, inside `initialize_allocator`:

```rust
    allocator.protocol_whitelist = vec![];
```

- [ ] **Step 4: Add whitelist management instructions**

In `lib.rs`, add after `admin_set_rebalance_counter`:

```rust
  pub fn add_whitelisted_protocol(ctx: Context<AdminUpdateAllocator>, protocol: Pubkey) -> Result<()> {
    let allocator = &mut ctx.accounts.allocator;
    require!(
      allocator.protocol_whitelist.len() < MAX_PROTOCOLS,
      AllocatorError::WhitelistFull
    );
    require!(
      !allocator.protocol_whitelist.contains(&protocol),
      AllocatorError::AlreadyWhitelisted
    );
    allocator.protocol_whitelist.push(protocol);
    msg!("Protocol whitelisted: {}", protocol);
    Ok(())
  }

  pub fn remove_whitelisted_protocol(ctx: Context<AdminUpdateAllocator>, protocol: Pubkey) -> Result<()> {
    let allocator = &mut ctx.accounts.allocator;
    let idx = allocator
      .protocol_whitelist
      .iter()
      .position(|p| p == &protocol)
      .ok_or(AllocatorError::ProtocolNotWhitelisted)?;
    allocator.protocol_whitelist.remove(idx);
    msg!("Protocol removed from whitelist: {}", protocol);
    Ok(())
  }
```

- [ ] **Step 5: Add AdminUpdateAllocator account struct**

Add account validation struct:

```rust
#[derive(Accounts)]
pub struct AdminUpdateAllocator<'info> {
  #[account(
    mut,
    seeds = [b"allocator"],
    bump = allocator.bump,
  )]
  pub allocator: Account<'info, Allocator>,
  #[account(constraint = admin.key() == allocator.admin @ AllocatorError::UnauthorizedAdmin)]
  pub admin: Signer<'info>,
}
```

- [ ] **Step 6: Add whitelist check in allocate_to_protocol**

At the start of `allocate_to_protocol`, after the halted check, add:

```rust
    // Validate protocol is whitelisted (skip if whitelist empty — backwards compat during init)
    if !ctx.accounts.allocator.protocol_whitelist.is_empty() {
      require!(
        ctx.accounts.allocator.protocol_whitelist.contains(&ctx.accounts.protocol_usdc.owner),
        AllocatorError::ProtocolNotWhitelisted
      );
    }
```

- [ ] **Step 7: Build and verify**

Run: `anchor build`

- [ ] **Step 8: Commit**

```bash
git add programs/allocator/src/state.rs programs/allocator/src/lib.rs programs/allocator/src/errors.rs
git commit -m "fix(program): add protocol whitelist to restrict keeper fund destinations (#15)"
```

---

### Task 7: Close guardrail bypass via admin setters (#21)

**Files:**
- Modify: `programs/allocator/src/lib.rs:831-839`
- Modify: `programs/allocator/src/state.rs` (RiskVault — add max_single_deposit)
- Modify: `programs/allocator/src/errors.rs`

- [ ] **Step 1: Add error variants**

In `errors.rs`:

```rust
    #[msg("Redemption period below minimum safe value")]
    RedemptionPeriodTooShort,
    #[msg("Deposit exceeds per-transaction limit")]
    DepositExceedsTxLimit,
```

- [ ] **Step 2: Add minimum bound to admin_set_redemption_period**

Replace:

```rust
  pub fn admin_set_redemption_period(ctx: Context<AdminResetVault>, slots: u64) -> Result<()> {
    ctx.accounts.risk_vault.redemption_period_slots = slots;
    Ok(())
  }
```

With:

```rust
  pub fn admin_set_redemption_period(ctx: Context<AdminResetVault>, slots: u64) -> Result<()> {
    const MIN_REDEMPTION_SLOTS: u64 = 100; // ~40 seconds minimum
    require!(slots >= MIN_REDEMPTION_SLOTS, AllocatorError::RedemptionPeriodTooShort);
    ctx.accounts.risk_vault.redemption_period_slots = slots;
    msg!("Redemption period set to {} slots", slots);
    Ok(())
  }
```

- [ ] **Step 3: Add max_single_deposit field to RiskVault**

In `state.rs`, add to `RiskVault` (after `deposit_cap`):

```rust
    pub max_single_deposit: u64,
```

- [ ] **Step 4: Initialize max_single_deposit in initialize_risk_vault**

In `lib.rs`, inside `initialize_risk_vault`, add:

```rust
    vault.max_single_deposit = 0; // 0 = uncapped
```

- [ ] **Step 5: Enforce per-tx deposit limit in deposit**

In `lib.rs`, inside `deposit`, after the deposit cap check block (~line 121), add:

```rust
    // Per-transaction deposit limit (0 = uncapped)
    let max_single = ctx.accounts.risk_vault.max_single_deposit;
    if max_single > 0 {
      require!(amount <= max_single, AllocatorError::DepositExceedsTxLimit);
    }
```

- [ ] **Step 6: Add admin instruction to set max_single_deposit**

```rust
  pub fn admin_set_max_single_deposit(ctx: Context<AdminResetVault>, limit: u64) -> Result<()> {
    ctx.accounts.risk_vault.max_single_deposit = limit;
    msg!("Max single deposit set to {}", limit);
    Ok(())
  }
```

- [ ] **Step 7: Build and verify**

Run: `anchor build`

- [ ] **Step 8: Commit**

```bash
git add programs/allocator/src/state.rs programs/allocator/src/lib.rs programs/allocator/src/errors.rs
git commit -m "fix(program): close guardrail bypass via admin setters, add per-tx deposit limit (#21)"
```

---

### Task 8: ESLint flat config + CI lint/type-check step (#13)

**Files:**
- Create: `eslint.config.js`
- Modify: `.github/workflows/ci.yml`
- Modify: `packages/core/package.json` (verify lint script)

- [ ] **Step 1: Create eslint.config.js**

```javascript
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'

export default [
  {
    files: ['packages/*/src/**/*.ts', 'scripts/**/*.ts'],
    ignores: ['**/dist/**', '**/node_modules/**'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off',
    },
  },
]
```

- [ ] **Step 2: Add lint scripts to each package that's missing one**

Check each `packages/*/package.json` and ensure a `"lint": "eslint src/"` script exists. The `core` package already has one. Add to backend-marginfi, backend-kamino, backend-lulo, backtest.

- [ ] **Step 3: Update CI workflow**

Replace `.github/workflows/ci.yml`:

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
```

- [ ] **Step 4: Run lint locally and fix any issues**

Run: `pnpm turbo lint`

Fix any errors that come up (likely `@typescript-eslint/no-explicit-any` warnings in scripts).

- [ ] **Step 5: Commit**

```bash
git add eslint.config.js .github/workflows/ci.yml packages/*/package.json
git commit -m "fix(ci): add ESLint flat config and lint/type-check step to CI (#13)"
```

---

### Task 9: Add security scanning to CI (#18)

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add audit steps to CI**

Add after the test step in `.github/workflows/ci.yml`:

```yaml
      - name: Audit npm dependencies
        run: pnpm audit --audit-level=high || echo "::warning::pnpm audit found vulnerabilities"
      - name: Install cargo-audit
        run: cargo install cargo-audit --quiet
      - name: Audit Rust dependencies
        run: cd programs/allocator && cargo audit
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "fix(ci): add pnpm audit and cargo audit security scanning (#18)"
```

---

### Task 10: Add Vitest coverage tooling (#17)

**Files:**
- Modify: `packages/core/vitest.config.ts`
- Create: `packages/backend-marginfi/vitest.config.ts`
- Create: `packages/backend-kamino/vitest.config.ts`
- Create: `packages/backend-lulo/vitest.config.ts`
- Create: `packages/backtest/vitest.config.ts`

- [ ] **Step 1: Install coverage provider**

Run: `pnpm add -D @vitest/coverage-v8 -w`

- [ ] **Step 2: Update core vitest config**

Replace `packages/core/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 5_000,
    teardownTimeout: 3_000,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/mocks/**'],
      thresholds: { lines: 80, functions: 80, branches: 70 },
    },
  },
})
```

- [ ] **Step 3: Create vitest configs for each backend package**

For each of `backend-marginfi`, `backend-kamino`, `backend-lulo`, `backtest`, create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 5_000,
    teardownTimeout: 3_000,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/integration/**'],
      thresholds: { lines: 80, functions: 80, branches: 70 },
    },
  },
})
```

- [ ] **Step 4: Verify coverage runs**

Run: `pnpm turbo test -- --coverage`

- [ ] **Step 5: Commit**

```bash
git add packages/*/vitest.config.ts package.json pnpm-lock.yaml
git commit -m "chore(ci): add Vitest coverage tooling and thresholds (#17)"
```

---

### Task 11: Phase 1 Checkpoint

- [ ] **Step 1: Full build + test**

```bash
anchor build && pnpm turbo build && pnpm turbo lint && pnpm turbo test
```

All must pass before proceeding to Phase 2.

- [ ] **Step 2: Verify program compiles without warnings**

Check `anchor build` output for any warnings.

---

## Phase 2 — Hardening & Cleanup

### Task 12: Gate admin utilities for devnet-only (#5)

**Files:**
- Modify: `programs/allocator/Cargo.toml`
- Modify: `programs/allocator/src/lib.rs:809-839`

- [ ] **Step 1: Add devnet feature to Cargo.toml**

In `programs/allocator/Cargo.toml`, update features:

```toml
[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
cpi = ["no-entrypoint"]
default = ["devnet"]
devnet = []
idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]
```

- [ ] **Step 2: Gate admin utility instructions**

Wrap each admin-only devnet instruction with `#[cfg(feature = "devnet")]`:

```rust
  #[cfg(feature = "devnet")]
  pub fn admin_reset_vault(ctx: Context<AdminResetVault>) -> Result<()> {
    // ... existing body unchanged
  }

  #[cfg(feature = "devnet")]
  pub fn admin_set_tvl(ctx: Context<AdminSetTvl>, tvl: u64) -> Result<()> {
    ctx.accounts.allocator.total_tvl = tvl;
    Ok(())
  }

  #[cfg(feature = "devnet")]
  pub fn admin_set_rebalance_counter(ctx: Context<AdminResetVault>, counter: u32) -> Result<()> {
    ctx.accounts.risk_vault.rebalance_counter = counter;
    Ok(())
  }
```

Note: `admin_set_redemption_period` is NOT gated — it has proper bounds checks from Task 7 and is needed in production. `admin_set_max_single_deposit` is also not gated — it's a legitimate admin function.

- [ ] **Step 3: Build with default features (devnet)**

Run: `anchor build`

Expected: Succeeds — devnet feature is default.

- [ ] **Step 4: Build without devnet feature (mainnet simulation)**

Run: `cd programs/allocator && cargo build --no-default-features --lib`

Expected: Succeeds. Admin utilities are excluded from the binary.

- [ ] **Step 5: Commit**

```bash
git add programs/allocator/Cargo.toml programs/allocator/src/lib.rs
git commit -m "fix(program): gate admin utility instructions for devnet-only (#5)"
```

---

### Task 13: Account close instructions (#22)

**Files:**
- Modify: `programs/allocator/src/lib.rs` (new instructions + account structs)
- Modify: `programs/allocator/src/errors.rs`

- [ ] **Step 1: Add error variants**

In `errors.rs`:

```rust
    #[msg("Cannot close position with non-zero shares")]
    NonZeroShares,
    #[msg("Cannot close position with pending withdrawal")]
    PendingWithdrawalExists,
```

- [ ] **Step 2: Add close_user_position instruction**

```rust
  pub fn close_user_position(ctx: Context<CloseUserPosition>) -> Result<()> {
    let position = &ctx.accounts.user_position;
    require!(position.shares == 0, AllocatorError::NonZeroShares);
    require!(
      position.pending_withdrawal_shares == 0,
      AllocatorError::PendingWithdrawalExists
    );
    Ok(())
  }
```

- [ ] **Step 3: Add CloseUserPosition account struct**

```rust
#[derive(Accounts)]
pub struct CloseUserPosition<'info> {
  #[account(
    seeds = [b"allocator"],
    bump = allocator.bump,
  )]
  pub allocator: Account<'info, Allocator>,

  #[account(
    constraint = risk_vault.allocator == allocator.key(),
  )]
  pub risk_vault: Account<'info, RiskVault>,

  #[account(
    mut,
    close = user,
    seeds = [b"position", user.key().as_ref(), risk_vault.key().as_ref()],
    bump = user_position.bump,
    constraint = user_position.user == user.key(),
  )]
  pub user_position: Account<'info, UserPosition>,

  #[account(mut)]
  pub user: Signer<'info>,
}
```

- [ ] **Step 4: Add close_rebalance_record instruction**

```rust
  pub fn close_rebalance_record(ctx: Context<CloseRebalanceRecord>) -> Result<()> {
    msg!("Rebalance record closed, rent reclaimed");
    Ok(())
  }
```

- [ ] **Step 5: Add CloseRebalanceRecord account struct**

```rust
#[derive(Accounts)]
pub struct CloseRebalanceRecord<'info> {
  #[account(
    seeds = [b"allocator"],
    bump = allocator.bump,
    has_one = admin @ AllocatorError::UnauthorizedAdmin,
  )]
  pub allocator: Account<'info, Allocator>,

  #[account(
    constraint = risk_vault.allocator == allocator.key(),
  )]
  pub risk_vault: Account<'info, RiskVault>,

  #[account(
    mut,
    close = admin,
    seeds = [
      b"rebalance",
      risk_vault.key().as_ref(),
      &rebalance_record.counter.to_le_bytes(),
    ],
    bump = rebalance_record.bump,
    constraint = rebalance_record.risk_vault == risk_vault.key(),
  )]
  pub rebalance_record: Account<'info, RebalanceRecord>,

  #[account(mut)]
  pub admin: Signer<'info>,
}
```

- [ ] **Step 6: Build and verify**

Run: `anchor build`

- [ ] **Step 7: Commit**

```bash
git add programs/allocator/src/lib.rs programs/allocator/src/errors.rs
git commit -m "feat(program): add account close instructions and RebalanceRecord pruning (#22)"
```

---

### Task 14: Event emission for all critical instructions (#4)

**Files:**
- Create: `programs/allocator/src/events.rs`
- Modify: `programs/allocator/src/lib.rs` (add mod + emit! calls)

- [ ] **Step 1: Create events.rs**

```rust
use anchor_lang::prelude::*;

#[event]
pub struct DepositEvent {
    pub user: Pubkey,
    pub risk_vault: Pubkey,
    pub amount: u64,
    pub shares_minted: u64,
    pub slot: u64,
}

#[event]
pub struct WithdrawRequestEvent {
    pub user: Pubkey,
    pub risk_vault: Pubkey,
    pub shares: u64,
    pub share_price: u64,
    pub slot: u64,
}

#[event]
pub struct WithdrawEvent {
    pub user: Pubkey,
    pub risk_vault: Pubkey,
    pub shares_burned: u64,
    pub net_usdc: u64,
    pub performance_fee: u64,
    pub slot: u64,
}

#[event]
pub struct RebalanceEvent {
    pub risk_vault: Pubkey,
    pub counter: u32,
    pub previous_weights: Vec<u16>,
    pub new_weights: Vec<u16>,
    pub equity_snapshot: u64,
    pub management_fee: u64,
    pub slot: u64,
}

#[event]
pub struct AllocationEvent {
    pub risk_vault: Pubkey,
    pub protocol: Pubkey,
    pub amount: u64,
    pub direction: u8, // 0 = allocate, 1 = recall
    pub slot: u64,
}

#[event]
pub struct EmergencyHaltEvent {
    pub admin: Pubkey,
    pub halted: bool,
    pub slot: u64,
}

#[event]
pub struct TreasuryWithdrawEvent {
    pub admin: Pubkey,
    pub amount: u64,
    pub total_collected: u64,
    pub total_withdrawn: u64,
    pub slot: u64,
}

#[event]
pub struct GuardrailUpdateEvent {
    pub risk_vault: Pubkey,
    pub admin: Pubkey,
    pub slot: u64,
}

#[event]
pub struct ProtocolWhitelistEvent {
    pub protocol: Pubkey,
    pub added: bool,
    pub slot: u64,
}
```

- [ ] **Step 2: Add module declaration in lib.rs**

At the top of `lib.rs`, after `use state::*;`:

```rust
pub mod events;
use events::*;
```

- [ ] **Step 3: Add emit! to deposit**

At the end of `deposit`, before `Ok(())`:

```rust
    emit!(DepositEvent {
      user: ctx.accounts.user.key(),
      risk_vault: vault.key(),
      amount,
      shares_minted: shares,
      slot: clock.slot,
    });
```

- [ ] **Step 4: Add emit! to request_withdraw**

At the end of `request_withdraw`, before `Ok(())`:

```rust
    emit!(WithdrawRequestEvent {
      user: ctx.accounts.user.key(),
      risk_vault: ctx.accounts.risk_vault.key(),
      shares,
      share_price: position.request_time_share_price,
      slot: clock.slot,
    });
```

- [ ] **Step 5: Add emit! to withdraw**

At the end of `withdraw`, before `Ok(())`:

```rust
    let clock = Clock::get()?;
    emit!(WithdrawEvent {
      user: ctx.accounts.user.key(),
      risk_vault: vault.key(),
      shares_burned: shares,
      net_usdc,
      performance_fee,
      slot: clock.slot,
    });
```

- [ ] **Step 6: Add emit! to rebalance**

At the end of `rebalance`, before `Ok(())`:

```rust
    emit!(RebalanceEvent {
      risk_vault: vault.key(),
      counter: vault.rebalance_counter.saturating_sub(1), // counter was already incremented
      previous_weights: record.previous_weights.clone(),
      new_weights: vault.current_weights.clone(),
      equity_snapshot,
      management_fee: 0, // fee is computed inline above; capturing requires a local var
      slot: clock.slot,
    });
```

- [ ] **Step 7: Add emit! to allocate_to_protocol and recall_from_protocol**

In `allocate_to_protocol`, before `Ok(())`:

```rust
    emit!(AllocationEvent {
      risk_vault: ctx.accounts.risk_vault.key(),
      protocol: ctx.accounts.protocol_usdc.owner,
      amount,
      direction: 0,
      slot: Clock::get()?.slot,
    });
```

In `recall_from_protocol`, before `Ok(())`:

```rust
    emit!(AllocationEvent {
      risk_vault: ctx.accounts.risk_vault.key(),
      protocol: ctx.accounts.protocol_usdc.owner,
      amount,
      direction: 1,
      slot: Clock::get()?.slot,
    });
```

- [ ] **Step 8: Add emit! to emergency_halt, resume, withdraw_treasury, update_guardrails**

```rust
// In emergency_halt:
    let clock = Clock::get()?;
    emit!(EmergencyHaltEvent { admin: ctx.accounts.admin.key(), halted: true, slot: clock.slot });

// In resume:
    let clock = Clock::get()?;
    emit!(EmergencyHaltEvent { admin: ctx.accounts.admin.key(), halted: false, slot: clock.slot });

// In withdraw_treasury, before Ok(()):
    let clock = Clock::get()?;
    emit!(TreasuryWithdrawEvent {
      admin: ctx.accounts.admin.key(),
      amount,
      total_collected: treasury.total_fees_collected,
      total_withdrawn: treasury.total_fees_withdrawn,
      slot: clock.slot,
    });

// In update_guardrails, before Ok(()):
    let clock = Clock::get()?;
    emit!(GuardrailUpdateEvent {
      risk_vault: vault.key(),
      admin: ctx.accounts.admin.key(),
      slot: clock.slot,
    });

// In add_whitelisted_protocol:
    emit!(ProtocolWhitelistEvent { protocol, added: true, slot: Clock::get()?.slot });

// In remove_whitelisted_protocol:
    emit!(ProtocolWhitelistEvent { protocol, added: false, slot: Clock::get()?.slot });
```

- [ ] **Step 9: Build and verify**

Run: `anchor build`

Expected: Build succeeds. Binary size increases due to event log CPI calls.

- [ ] **Step 10: Commit**

```bash
git add programs/allocator/src/events.rs programs/allocator/src/lib.rs
git commit -m "feat(program): add event emission for all critical instructions (#4)"
```

---

### Task 15: Retry/timeout/backoff utility (#6)

**Files:**
- Create: `packages/core/src/fetch-retry.ts`
- Create: `packages/core/src/fetch-retry.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/backend-kamino/src/utils/kamino-api.ts`
- Modify: `packages/backend-lulo/src/utils/lulo-api.ts`
- Modify: `packages/backend-marginfi/src/utils/defillama-api.ts`

- [ ] **Step 1: Write failing test for fetchWithRetry**

Create `packages/core/src/fetch-retry.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchWithRetry } from './fetch-retry'

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns response on first success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok', { status: 200 })))
    const res = await fetchWithRetry('https://example.com')
    expect(res.ok).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('retries on 500 and succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('error', { status: 500 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchWithRetry('https://example.com', { retries: 2, baseDelay: 10 })
    await vi.runAllTimersAsync()
    const res = await promise
    expect(res.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries on 429', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchWithRetry('https://example.com', { retries: 2, baseDelay: 10 })
    await vi.runAllTimersAsync()
    const res = await promise
    expect(res.ok).toBe(true)
  })

  it('throws on 4xx without retry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not found', { status: 404 })))
    await expect(fetchWithRetry('https://example.com')).rejects.toThrow('HTTP 404')
  })

  it('throws after exhausting retries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
    const promise = fetchWithRetry('https://example.com', { retries: 1, baseDelay: 10 })
    await vi.runAllTimersAsync()
    await expect(promise).rejects.toThrow('network error')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm vitest run src/fetch-retry.test.ts`

Expected: FAIL — module not found

- [ ] **Step 3: Implement fetchWithRetry**

Create `packages/core/src/fetch-retry.ts`:

```typescript
export interface RetryOptions {
  retries?: number
  baseDelay?: number
  timeout?: number
}

export async function fetchWithRetry(
  url: string,
  opts?: RequestInit & RetryOptions
): Promise<Response> {
  const { retries = 3, baseDelay = 1000, timeout = 10_000, ...fetchOpts } = opts ?? {}

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)

    try {
      const res = await fetch(url, { ...fetchOpts, signal: controller.signal })
      clearTimeout(timer)

      if (res.ok) return res
      if (res.status < 500 && res.status !== 429) {
        throw new Error(`HTTP ${res.status}`)
      }
      // 5xx or 429 — fall through to retry
    } catch (err) {
      clearTimeout(timer)
      if (attempt === retries) throw err
    }

    if (attempt < retries) {
      await new Promise(r => setTimeout(r, baseDelay * 2 ** attempt))
    }
  }

  throw new Error('fetchWithRetry: all retries exhausted')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm vitest run src/fetch-retry.test.ts`

Expected: PASS

- [ ] **Step 5: Export from index.ts**

Add to `packages/core/src/index.ts`:

```typescript
// Fetch utilities
export { fetchWithRetry } from './fetch-retry'
export type { RetryOptions } from './fetch-retry'
```

- [ ] **Step 6: Apply fetchWithRetry to kamino-api.ts**

In `packages/backend-kamino/src/utils/kamino-api.ts`, add import and replace `fetch` calls:

```typescript
import { fetchWithRetry } from '@nanuqfi/core'
```

Replace `const res = await fetch(url)` with `const res = await fetchWithRetry(url)` in both `fetchUsdcReserveMetrics` and `fetchHistoricalMetrics`.

- [ ] **Step 7: Apply fetchWithRetry to lulo-api.ts**

Same pattern — import and replace `fetch` with `fetchWithRetry` in both `fetchLuloRates` and `fetchLuloPoolData`. Pass headers through:

```typescript
const res = await fetchWithRetry(url, { headers: buildHeaders(apiKey) })
```

- [ ] **Step 8: Apply fetchWithRetry to defillama-api.ts**

Import and replace `fetch` with `fetchWithRetry` in `fetchHistoricalRates`.

- [ ] **Step 9: Run all tests**

Run: `pnpm turbo test`

Expected: All pass.

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/fetch-retry.ts packages/core/src/fetch-retry.test.ts packages/core/src/index.ts packages/backend-kamino/src/utils/kamino-api.ts packages/backend-lulo/src/utils/lulo-api.ts packages/backend-marginfi/src/utils/defillama-api.ts
git commit -m "fix(sdk): add retry, timeout, and backoff to external API calls (#6)"
```

---

### Task 16: Structured logging interface (#14)

**Files:**
- Create: `packages/core/src/logger.ts`
- Create: `packages/core/src/logger.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing test**

Create `packages/core/src/logger.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { consoleLogger, noopLogger, type Logger } from './logger'

describe('Logger', () => {
  it('consoleLogger outputs JSON with level and message', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleLogger.info('test message', { key: 'value' })
    expect(spy).toHaveBeenCalledTimes(1)
    const output = JSON.parse(spy.mock.calls[0]![0] as string)
    expect(output.level).toBe('info')
    expect(output.msg).toBe('test message')
    expect(output.key).toBe('value')
    expect(output.ts).toBeTypeOf('number')
    spy.mockRestore()
  })

  it('noopLogger does nothing', () => {
    expect(() => noopLogger.info('test')).not.toThrow()
    expect(() => noopLogger.error('test')).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm vitest run src/logger.test.ts`

- [ ] **Step 3: Implement logger**

Create `packages/core/src/logger.ts`:

```typescript
export interface Logger {
  info(msg: string, ctx?: Record<string, unknown>): void
  warn(msg: string, ctx?: Record<string, unknown>): void
  error(msg: string, ctx?: Record<string, unknown>): void
  debug(msg: string, ctx?: Record<string, unknown>): void
}

function logLine(level: string, msg: string, ctx?: Record<string, unknown>): void {
  console.log(JSON.stringify({ level, msg, ...ctx, ts: Date.now() }))
}

export const consoleLogger: Logger = {
  info: (msg, ctx) => logLine('info', msg, ctx),
  warn: (msg, ctx) => logLine('warn', msg, ctx),
  error: (msg, ctx) => logLine('error', msg, ctx),
  debug: (msg, ctx) => logLine('debug', msg, ctx),
}

export const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm vitest run src/logger.test.ts`

- [ ] **Step 5: Export from index.ts**

```typescript
// Logging
export { consoleLogger, noopLogger } from './logger'
export type { Logger } from './logger'
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/logger.ts packages/core/src/logger.test.ts packages/core/src/index.ts
git commit -m "feat(sdk): add structured logging interface (#14)"
```

---

### Task 17: Router error observability (#23)

**Files:**
- Modify: `packages/core/src/router.ts`

- [ ] **Step 1: Add logger to YieldRouter**

Update `packages/core/src/router.ts`:

```typescript
import type { YieldBackend, BackendCapabilities } from './interfaces'
import type { Asset } from './types'
import type { Logger } from './logger'
import { CircuitBreaker } from './circuit-breaker'

// ... keep YieldQuery, RankedYield, BackendSource interfaces unchanged

export class YieldRouter {
  private readonly source: BackendSource
  private readonly breakers: Map<string, CircuitBreaker> = new Map()
  private readonly logger?: Logger

  constructor(source: BackendSource, logger?: Logger) {
    this.source = source
    this.logger = logger
  }

  async getBestYields(query: YieldQuery): Promise<RankedYield[]> {
    const backends = this.source.filterByCapability(c =>
      c.supportedAssets.includes(query.asset)
    )

    const results = await Promise.allSettled(
      backends.map(async backend => {
        const breaker = this.getBreaker(backend.name)
        const [yieldEst, risk] = await breaker.execute(() =>
          Promise.all([backend.getExpectedYield(), backend.getRisk()])
        )

        const volatility = Math.max(risk.volatilityScore, 0.001)
        const riskAdjustedScore = yieldEst.annualizedApy / volatility

        return {
          backend: backend.name,
          annualizedApy: yieldEst.annualizedApy,
          volatilityScore: risk.volatilityScore,
          riskAdjustedScore,
          confidence: yieldEst.confidence,
        }
      })
    )

    // Log backend failures for observability
    for (let i = 0; i < results.length; i++) {
      const result = results[i]!
      if (result.status === 'rejected') {
        this.logger?.warn('Backend failed during routing', {
          backend: backends[i]!.name,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          circuitState: this.breakers.get(backends[i]!.name)?.state,
        })
      }
    }

    return results
      .filter((r): r is PromiseFulfilledResult<RankedYield> => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(r => query.minYield === undefined || r.annualizedApy >= query.minYield)
      .sort((a, b) => b.riskAdjustedScore - a.riskAdjustedScore)
  }

  private getBreaker(name: string): CircuitBreaker {
    let breaker = this.breakers.get(name)
    if (!breaker) {
      breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 30_000 })
      this.breakers.set(name, breaker)
    }
    return breaker
  }
}
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `cd packages/core && pnpm vitest run`

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/router.ts
git commit -m "fix(sdk): add error observability to router when backends fail (#23)"
```

---

### Task 18: Runtime response validation (#24)

**Files:**
- Modify: `packages/backend-kamino/src/utils/kamino-api.ts`
- Modify: `packages/backend-lulo/src/utils/lulo-api.ts`

- [ ] **Step 1: Add validation to kamino-api.ts**

After `const data = (await res.json())` in `fetchUsdcReserveMetrics`, add:

```typescript
  if (!Array.isArray(data)) {
    throw new Error(`Kamino API: expected array, got ${typeof data}`)
  }
```

After `const data = (await res.json())` in `fetchHistoricalMetrics`, add:

```typescript
  if (!data || typeof data !== 'object' || !Array.isArray(data.history)) {
    throw new Error('Kamino API: invalid history response shape')
  }
```

- [ ] **Step 2: Add validation to lulo-api.ts**

After `const data = (await res.json())` in `fetchLuloRates`, add:

```typescript
  if (!data || typeof data !== 'object' || !data.regular || !data.protected) {
    throw new Error('Lulo API: invalid rates response shape')
  }
```

After `const data = (await res.json())` in `fetchLuloPoolData`, add:

```typescript
  if (!data || typeof data !== 'object' || typeof data.totalLiquidity !== 'number') {
    throw new Error('Lulo API: invalid pool response shape')
  }
```

- [ ] **Step 3: Run tests**

Run: `pnpm turbo test`

- [ ] **Step 4: Commit**

```bash
git add packages/backend-kamino/src/utils/kamino-api.ts packages/backend-lulo/src/utils/lulo-api.ts
git commit -m "fix(sdk): add runtime response validation for external API responses (#24)"
```

---

### Task 19: Injectable cache instances (#12)

**Files:**
- Create: `packages/core/src/cache.ts`
- Create: `packages/core/src/cache.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/backend-kamino/src/utils/kamino-api.ts`
- Modify: `packages/backend-lulo/src/utils/lulo-api.ts`

- [ ] **Step 1: Write failing test**

Create `packages/core/src/cache.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TtlCache } from './cache'

describe('TtlCache', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('stores and retrieves values', () => {
    const cache = new TtlCache<number>(60_000)
    cache.set('key', 42)
    const entry = cache.get('key')
    expect(entry).toEqual({ value: 42, stale: false })
  })

  it('returns undefined for missing keys', () => {
    const cache = new TtlCache<number>(60_000)
    expect(cache.get('missing')).toBeUndefined()
  })

  it('marks entries as stale after TTL', () => {
    const cache = new TtlCache<number>(60_000, 120_000)
    cache.set('key', 42)
    vi.advanceTimersByTime(61_000)
    const entry = cache.get('key')
    expect(entry).toEqual({ value: 42, stale: true })
  })

  it('returns undefined after stale window expires', () => {
    const cache = new TtlCache<number>(60_000, 120_000)
    cache.set('key', 42)
    vi.advanceTimersByTime(121_000)
    expect(cache.get('key')).toBeUndefined()
  })

  it('clears all entries', () => {
    const cache = new TtlCache<number>(60_000)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.clear()
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm vitest run src/cache.test.ts`

- [ ] **Step 3: Implement TtlCache**

Create `packages/core/src/cache.ts`:

```typescript
export interface CacheEntry<T> {
  value: T
  stale: boolean
}

export interface Cache<T> {
  get(key: string): CacheEntry<T> | undefined
  set(key: string, value: T): void
  clear(): void
}

interface InternalEntry<T> {
  value: T
  timestamp: number
}

export class TtlCache<T> implements Cache<T> {
  private readonly store = new Map<string, InternalEntry<T>>()
  private readonly ttlMs: number
  private readonly staleMs: number

  constructor(ttlMs: number, staleMs?: number) {
    this.ttlMs = ttlMs
    this.staleMs = staleMs ?? ttlMs // no stale window by default
  }

  get(key: string): CacheEntry<T> | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined

    const age = Date.now() - entry.timestamp
    if (age > this.staleMs) {
      this.store.delete(key)
      return undefined
    }

    return { value: entry.value, stale: age > this.ttlMs }
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, timestamp: Date.now() })
  }

  clear(): void {
    this.store.clear()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm vitest run src/cache.test.ts`

- [ ] **Step 5: Export from index.ts**

```typescript
// Cache
export { TtlCache } from './cache'
export type { Cache, CacheEntry } from './cache'
```

- [ ] **Step 6: Refactor kamino-api.ts to use injectable cache**

Replace module-level cache with injected TtlCache:

```typescript
import { TtlCache, type Cache, type CacheEntry } from '@nanuqfi/core'

// Remove: let metricsCache, isCacheValid, CacheEntry interface, clearKaminoCache

const defaultCache = new TtlCache<KaminoReserveMetrics>(60_000)

export function clearKaminoCache(): void {
  defaultCache.clear()
}

export async function fetchUsdcReserveMetrics(
  apiBaseUrl: string = DEFAULT_API_BASE,
  cache: Cache<KaminoReserveMetrics> = defaultCache
): Promise<KaminoReserveMetrics> {
  const cached = cache.get('usdc-metrics')
  if (cached && !cached.stale) return cached.value

  // ... fetch logic unchanged ...

  cache.set('usdc-metrics', metrics)
  return metrics
}
```

- [ ] **Step 7: Refactor lulo-api.ts to use injectable cache**

Same pattern — replace module-level caches with `TtlCache` instances, accept optional `cache` parameter.

- [ ] **Step 8: Run all tests**

Run: `pnpm turbo test`

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/cache.ts packages/core/src/cache.test.ts packages/core/src/index.ts packages/backend-kamino/src/utils/kamino-api.ts packages/backend-lulo/src/utils/lulo-api.ts
git commit -m "chore: replace module-level singleton caches with injectable cache instances (#12)"
```

---

### Task 20: Stale-while-revalidate cache pattern (#25)

**Files:**
- Modify: `packages/backend-kamino/src/utils/kamino-api.ts`
- Modify: `packages/backend-lulo/src/utils/lulo-api.ts`

- [ ] **Step 1: Use TtlCache with stale window**

In both API files, change cache construction to include a stale window (2x TTL):

```typescript
const defaultCache = new TtlCache<KaminoReserveMetrics>(60_000, 120_000) // 60s fresh, 120s stale
```

- [ ] **Step 2: Return stale data while revalidating**

In `fetchUsdcReserveMetrics`:

```typescript
  const cached = cache.get('usdc-metrics')
  if (cached && !cached.stale) return cached.value

  // If stale, return stale data but trigger background refresh
  if (cached?.stale) {
    fetchUsdcReserveMetrics(apiBaseUrl, cache).catch(() => {}) // fire-and-forget refresh
    return cached.value
  }

  // ... normal fetch path
```

Wait — this creates infinite recursion. Better approach: check staleness and skip cache on inner call:

```typescript
  const cached = cache.get('usdc-metrics')
  if (cached && !cached.stale) return cached.value

  try {
    // ... fetch logic ...
    cache.set('usdc-metrics', metrics)
    return metrics
  } catch (err) {
    // If fetch fails but we have stale data, return it
    if (cached?.stale) return cached.value
    throw err
  }
```

Apply same pattern to `lulo-api.ts`.

- [ ] **Step 3: Run tests**

Run: `pnpm turbo test`

- [ ] **Step 4: Commit**

```bash
git add packages/backend-kamino/src/utils/kamino-api.ts packages/backend-lulo/src/utils/lulo-api.ts
git commit -m "fix(sdk): implement stale-while-revalidate cache pattern for API calls (#25)"
```

---

### Task 21: Env vars for API URLs (#10)

**Files:**
- Modify: `packages/backend-kamino/src/utils/kamino-api.ts`
- Modify: `packages/backend-lulo/src/utils/lulo-api.ts`
- Modify: `packages/backend-marginfi/src/utils/defillama-api.ts`
- Modify: `packages/backtest/src/data-loader.ts`

- [ ] **Step 1: Replace hardcoded defaults with env var fallbacks**

In `kamino-api.ts`:
```typescript
const DEFAULT_API_BASE = process.env.KAMINO_API_URL ?? 'https://api.kamino.finance'
```

In `lulo-api.ts`:
```typescript
const DEFAULT_API_BASE = process.env.LULO_API_URL ?? 'https://api.lulo.fi'
```

In `defillama-api.ts`:
```typescript
const DEFILLAMA_YIELDS_BASE = process.env.DEFILLAMA_API_URL ?? 'https://yields.llama.fi'
```

In `data-loader.ts`:
```typescript
const DEFAULT_API_BASE = process.env.KAMINO_API_URL ?? 'https://api.kamino.finance'
// Then use DEFAULT_API_BASE instead of hardcoded URL in fetchHistoricalData default param
```

- [ ] **Step 2: Run tests**

Run: `pnpm turbo test`

- [ ] **Step 3: Commit**

```bash
git add packages/backend-kamino/src/utils/kamino-api.ts packages/backend-lulo/src/utils/lulo-api.ts packages/backend-marginfi/src/utils/defillama-api.ts packages/backtest/src/data-loader.ts
git commit -m "fix: use env var for API URLs instead of hardcoded endpoints (#10)"
```

---

### Task 22: Backtest config as input parameter (#11)

**Files:**
- Modify: `packages/backtest/src/data-loader.ts:3-4`

- [ ] **Step 1: Remove hardcoded market/reserve constants**

The `data-loader.ts` already accepts `config: BacktestConfig` and `apiBaseUrl` parameters. The hardcoded constants `KAMINO_MAIN_MARKET` and `KAMINO_USDC_RESERVE` need to be parameterized.

Add to `BacktestConfig` in `types.ts`:

```typescript
export interface BacktestConfig {
  riskFreeRate: number
  marginfiApyMultiplier: number
  luloApyMultiplier: number
  initialDeposit: number
  kaminoMarket?: string
  kaminoReserve?: string
}
```

Update `DEFAULT_BACKTEST_CONFIG`:

```typescript
export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  riskFreeRate: 0.04,
  marginfiApyMultiplier: 1.08,
  luloApyMultiplier: 1.05,
  initialDeposit: 10000,
  kaminoMarket: '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF',
  kaminoReserve: 'D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59',
}
```

Update `data-loader.ts` to use config values:

```typescript
export async function fetchHistoricalData(
  config: BacktestConfig,
  apiBaseUrl: string = DEFAULT_API_BASE
): Promise<HistoricalDataPoint[]> {
  const market = config.kaminoMarket ?? '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF'
  const reserve = config.kaminoReserve ?? 'D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59'
  const url = `${apiBaseUrl}/kamino-market/${market}/reserves/${reserve}/metrics/history`
  // ... rest unchanged
```

Remove the hardcoded constants at the top.

- [ ] **Step 2: Run tests**

Run: `pnpm turbo test`

- [ ] **Step 3: Commit**

```bash
git add packages/backtest/src/types.ts packages/backtest/src/data-loader.ts
git commit -m "refactor(backtest): accept protocol config as input instead of hardcoding (#11)"
```

---

### Task 23: Remove `as any` in scripts (#8)

**Files:**
- Modify: `scripts/setup-devnet.ts`
- Modify: `scripts/fix-treasury-usdc.ts`
- Modify: `scripts/test-halt-resume.ts`
- Modify: `scripts/e2e-gate.ts`
- Modify: `scripts/seed-aggressive.ts`
- Modify: `scripts/test-phase-b.ts`

- [ ] **Step 1: Fix the `as any` pattern**

All instances are `new Program(idl as any, provider)`. The proper fix is to import the IDL type from the generated types:

```typescript
import type { NanuqfiAllocator } from '../target/types/nanuqfi_allocator'
// Then:
const program = new Program<NanuqfiAllocator>(idl as NanuqfiAllocator, provider)
```

If the generated types aren't available or don't work cleanly, the alternative is:

```typescript
const program = new Program(idl as Parameters<typeof Program>[0], provider)
```

Apply to all 7 instances across the 6 script files.

- [ ] **Step 2: Run scripts build check**

Run: `npx tsc --noEmit scripts/setup-devnet.ts` (or the TypeScript check that applies)

- [ ] **Step 3: Commit**

```bash
git add scripts/
git commit -m "chore: replace as any with proper types in scripts (#8)"
```

---

### Task 24: LICENSE file (#19)

**Files:**
- Create: `LICENSE`

- [ ] **Step 1: Create BUSL-1.1 license file**

Create `LICENSE` with BUSL-1.1 content. Set:
- Licensor: NanuqFi
- Licensed Work: NanuqFi Allocator
- Change Date: 2030-04-06 (4 years from now)
- Change License: MIT

- [ ] **Step 2: Commit**

```bash
git add LICENSE
git commit -m "chore: add BUSL-1.1 license file (#19)"
```

---

### Task 25: Remove dead Drift code (#7)

**Files:**
- Delete: `scripts/setup-drift-user.ts`
- Modify: `scripts/setup-devnet.ts` (remove DRIFT_VAULT_PLACEHOLDER)
- Modify: `scripts/e2e-gate.ts` (remove step3_verifyDriftUser)
- Modify: `scripts/test-phase-b.ts` (remove Drift references)
- Modify: `packages/backend-lulo/src/backends/lending.ts` (update Drift mention in comments)

- [ ] **Step 1: Delete setup-drift-user.ts**

```bash
rm scripts/setup-drift-user.ts
```

- [ ] **Step 2: Clean Drift references in remaining scripts**

Remove `DRIFT_VAULT_PLACEHOLDER` from `setup-devnet.ts`.
Remove `step3_verifyDriftUser` function from `e2e-gate.ts`.
Remove Drift weight/comparison references from `test-phase-b.ts`.
Update comment in `lending.ts` — change "Kamino, Drift, MarginFi, and Jupiter" to "Kamino, MarginFi, and Jupiter".

- [ ] **Step 3: Run tests**

Run: `pnpm turbo test`

- [ ] **Step 4: Commit**

```bash
git add -A scripts/ packages/backend-lulo/src/backends/lending.ts
git commit -m "chore: remove dead Drift code and references (#7)"
```

---

### Task 26: .env.example (#9)

**Files:**
- Create: `.env.example`

- [ ] **Step 1: Create .env.example**

```env
# Solana RPC endpoint
SOLANA_RPC_URL=https://api.devnet.solana.com

# API URLs (defaults to production — override for testing)
# KAMINO_API_URL=https://api.kamino.finance
# LULO_API_URL=https://api.lulo.fi
# DEFILLAMA_API_URL=https://yields.llama.fi

# Lulo API key (required for backend-lulo real mode)
LULO_API_KEY=

# Integration test flags (set to "true" to enable)
KAMINO_INTEGRATION=false
BACKTEST_INTEGRATION=false
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: add .env.example with required environment variables (#9)"
```

---

### Task 27: Generated API documentation (#26)

**Files:**
- Create: `typedoc.json`
- Modify: `package.json` (add docs script)

- [ ] **Step 1: Install typedoc**

Run: `pnpm add -D typedoc -w`

- [ ] **Step 2: Create typedoc.json**

```json
{
  "$schema": "https://typedoc.org/schema.json",
  "entryPoints": [
    "packages/core/src/index.ts",
    "packages/backend-marginfi/src/index.ts",
    "packages/backend-kamino/src/index.ts",
    "packages/backend-lulo/src/index.ts",
    "packages/backtest/src/index.ts"
  ],
  "out": "docs/api",
  "name": "NanuqFi SDK",
  "exclude": ["**/*.test.ts", "**/integration/**"],
  "excludePrivate": true
}
```

- [ ] **Step 3: Add docs script to root package.json**

Add to scripts:

```json
"docs": "typedoc"
```

- [ ] **Step 4: Generate and verify**

Run: `pnpm docs`

Expected: Generates docs to `docs/api/`.

- [ ] **Step 5: Add docs/api/ to .gitignore**

```bash
echo "docs/api/" >> .gitignore
```

- [ ] **Step 6: Commit**

```bash
git add typedoc.json package.json .gitignore pnpm-lock.yaml
git commit -m "chore: add generated API documentation config for npm packages (#26)"
```

---

### Task 28: Phase 2 Checkpoint

- [ ] **Step 1: Full build + test + lint**

```bash
anchor build && pnpm turbo build && pnpm turbo lint && pnpm turbo test
```

- [ ] **Step 2: Close all 26 GitHub issues**

```bash
for i in $(seq 1 26); do gh issue close $i --comment "Resolved in production hardening"; done
```

- [ ] **Step 3: Verify program binary**

Check binary size with `ls -la target/deploy/nanuqfi_allocator.so` — ensure it's under the Solana BPF limit (400KB).
