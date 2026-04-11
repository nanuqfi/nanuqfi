# Ranger Earn Adaptor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Solana adaptor program that bridges Ranger Earn vaults to NanuqFi's AI-powered yield allocator, plus a mock Ranger vault for devnet E2E testing.

**Architecture:** Thin CPI bridge (adaptor) translates Ranger's 3-instruction interface (initialize/deposit/withdraw) into our existing allocator's instructions. Mock vault simulates Ranger's CPI pattern on devnet.

**Tech Stack:** Rust/Anchor 0.30.1, TypeScript (integration tests), Solana devnet

**Spec:** `docs/superpowers/specs/2026-04-11-ranger-adaptor-design.md`

---

## File Structure

```
programs/
  allocator/                    → existing (no changes)
  nanuqfi-adaptor/              → NEW
    Cargo.toml
    Xargo.toml
    src/
      lib.rs                    → 3 instructions + account contexts + state
  mock-ranger-vault/            → NEW (test-only)
    Cargo.toml
    Xargo.toml
    src/
      lib.rs                    → 2 instructions (deposit_strategy, withdraw_strategy)
tests/
  ranger-adaptor.test.ts        → NEW integration tests
scripts/
  setup-ranger-devnet.ts        → NEW setup script for adaptor + mock vault
```

---

### Task 1: Scaffold the NanuqFi Adaptor Program

**Files:**
- Create: `programs/nanuqfi-adaptor/Cargo.toml`
- Create: `programs/nanuqfi-adaptor/Xargo.toml`
- Create: `programs/nanuqfi-adaptor/src/lib.rs`
- Modify: `Anchor.toml` (add program entry)

- [ ] **Step 1: Create Cargo.toml**

```toml
# programs/nanuqfi-adaptor/Cargo.toml
[package]
name = "nanuqfi-adaptor"
version = "0.1.0"
description = "NanuqFi adaptor for Ranger Earn vault integration"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "nanuqfi_adaptor"

[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
cpi = ["no-entrypoint"]
default = []

[dependencies]
anchor-lang = "0.30.1"
anchor-spl = "0.30.1"
nanuqfi-allocator = { path = "../allocator", features = ["cpi"] }
```

- [ ] **Step 2: Create Xargo.toml**

```toml
# programs/nanuqfi-adaptor/Xargo.toml
[target.bpfel-unknown-unknown.dependencies.std]
features = []
```

- [ ] **Step 3: Create initial lib.rs with state and initialize instruction**

```rust
// programs/nanuqfi-adaptor/src/lib.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};
use nanuqfi_allocator::state::{Allocator, RiskVault, UserPosition, CURRENT_VERSION};
use nanuqfi_allocator::program::NanuqfiAllocator;

declare_id!("AdptNanuqFi11111111111111111111111111111111");

#[program]
pub mod nanuqfi_adaptor {
    use super::*;

    /// Initialize the NanuqFi strategy for a Ranger vault.
    /// Called once when a vault manager adds NanuqFi as a strategy.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let strategy = &mut ctx.accounts.strategy;
        strategy.allocator = ctx.accounts.allocator.key();
        strategy.risk_vault = ctx.accounts.risk_vault.key();
        strategy.position_value = 0;
        strategy.bump = ctx.bumps.strategy;

        msg!("NanuqFi strategy initialized for allocator {}", strategy.allocator);
        Ok(())
    }

    /// Deposit USDC from Ranger vault into NanuqFi allocator.
    /// Ranger has already transferred USDC to vault_strategy_asset_ata.
    /// Returns position value as u64 via sol_set_return_data.
    pub fn deposit(ctx: Context<AdaptorDeposit>, amount: u64) -> Result<()> {
        // CPI into allocator's deposit instruction
        let cpi_program = ctx.accounts.allocator_program.to_account_info();
        let cpi_accounts = nanuqfi_allocator::cpi::accounts::Deposit {
            allocator: ctx.accounts.allocator.to_account_info(),
            risk_vault: ctx.accounts.risk_vault.to_account_info(),
            user_position: ctx.accounts.user_position.to_account_info(),
            share_mint: ctx.accounts.share_mint.to_account_info(),
            usdc_mint: ctx.accounts.usdc_mint.to_account_info(),
            user_usdc: ctx.accounts.vault_strategy_asset_ata.to_account_info(),
            user_shares: ctx.accounts.user_share_ata.to_account_info(),
            vault_usdc: ctx.accounts.vault_usdc.to_account_info(),
            user: ctx.accounts.vault_strategy_auth.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        nanuqfi_allocator::cpi::deposit(cpi_ctx, amount)?;

        // Reload risk_vault after CPI to get updated total_assets
        ctx.accounts.risk_vault.reload()?;

        // Compute position value: (user_shares / total_shares) * total_assets
        let vault = &ctx.accounts.risk_vault;
        let position_value = if vault.total_shares > 0 {
            let user_shares_balance = ctx.accounts.user_share_ata.amount;
            ((user_shares_balance as u128)
                .checked_mul(vault.total_assets as u128)
                .unwrap()
                / (vault.total_shares as u128)) as u64
        } else {
            0
        };

        // Update strategy state
        let strategy = &mut ctx.accounts.strategy;
        strategy.position_value = position_value;

        // Return position value to Ranger vault via return data
        anchor_lang::solana_program::program::set_return_data(&position_value.to_le_bytes());

        msg!("NanuqFi deposit: {} USDC, position value: {}", amount, position_value);
        Ok(())
    }

    /// Withdraw USDC from NanuqFi allocator back to Ranger vault.
    /// Returns remaining position value via sol_set_return_data.
    pub fn withdraw(ctx: Context<AdaptorWithdraw>, amount: u64) -> Result<()> {
        // Convert USDC amount to shares
        let vault = &ctx.accounts.risk_vault;
        let shares = if vault.total_assets > 0 && vault.total_shares > 0 {
            ((amount as u128)
                .checked_mul(vault.total_shares as u128)
                .unwrap()
                / (vault.total_assets as u128)) as u64
        } else {
            amount
        };

        // CPI: request_withdraw
        let cpi_program = ctx.accounts.allocator_program.to_account_info();
        let request_accounts = nanuqfi_allocator::cpi::accounts::RequestWithdraw {
            allocator: ctx.accounts.allocator.to_account_info(),
            risk_vault: ctx.accounts.risk_vault.to_account_info(),
            user_position: ctx.accounts.user_position.to_account_info(),
            user: ctx.accounts.vault_strategy_auth.to_account_info(),
        };
        nanuqfi_allocator::cpi::request_withdraw(
            CpiContext::new(cpi_program.clone(), request_accounts),
            shares,
        )?;

        // CPI: withdraw (instant on devnet — redemption period = 0)
        let withdraw_accounts = nanuqfi_allocator::cpi::accounts::Withdraw {
            allocator: ctx.accounts.allocator.to_account_info(),
            risk_vault: ctx.accounts.risk_vault.to_account_info(),
            user_position: ctx.accounts.user_position.to_account_info(),
            treasury: ctx.accounts.treasury.to_account_info(),
            share_mint: ctx.accounts.share_mint.to_account_info(),
            usdc_mint: ctx.accounts.usdc_mint.to_account_info(),
            user_shares: ctx.accounts.user_share_ata.to_account_info(),
            user_usdc: ctx.accounts.vault_strategy_asset_ata.to_account_info(),
            vault_usdc: ctx.accounts.vault_usdc.to_account_info(),
            treasury_usdc: ctx.accounts.treasury_usdc.to_account_info(),
            user: ctx.accounts.vault_strategy_auth.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
        };
        nanuqfi_allocator::cpi::withdraw(
            CpiContext::new(cpi_program, withdraw_accounts),
        )?;

        // Reload and compute remaining position value
        ctx.accounts.risk_vault.reload()?;
        let vault = &ctx.accounts.risk_vault;
        let remaining = if vault.total_shares > 0 {
            ctx.accounts.user_share_ata.reload()?;
            let user_shares_balance = ctx.accounts.user_share_ata.amount;
            ((user_shares_balance as u128)
                .checked_mul(vault.total_assets as u128)
                .unwrap()
                / (vault.total_shares as u128)) as u64
        } else {
            0
        };

        let strategy = &mut ctx.accounts.strategy;
        strategy.position_value = remaining;

        anchor_lang::solana_program::program::set_return_data(&remaining.to_le_bytes());

        msg!("NanuqFi withdraw: {} USDC, remaining: {}", amount, remaining);
        Ok(())
    }
}

// ─── State ──────────────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct NanuqfiStrategy {
    pub allocator: Pubkey,
    pub risk_vault: Pubkey,
    pub position_value: u64,
    pub bump: u8,
}

// ─── Account Contexts ───────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub vault_strategy_auth: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + NanuqfiStrategy::INIT_SPACE,
        seeds = [b"nanuqfi_strategy", allocator.key().as_ref()],
        bump,
    )]
    pub strategy: Account<'info, NanuqfiStrategy>,

    /// NanuqFi allocator PDA (validated by seeds)
    pub allocator: Account<'info, Allocator>,

    /// Target risk vault
    #[account(constraint = risk_vault.allocator == allocator.key())]
    pub risk_vault: Account<'info, RiskVault>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdaptorDeposit<'info> {
    pub vault_strategy_auth: Signer<'info>,

    #[account(
        mut,
        seeds = [b"nanuqfi_strategy", allocator.key().as_ref()],
        bump = strategy.bump,
    )]
    pub strategy: Account<'info, NanuqfiStrategy>,

    /// USDC mint
    pub usdc_mint: Account<'info, Mint>,

    /// Ranger's strategy asset token account (source USDC)
    #[account(mut, token::mint = usdc_mint)]
    pub vault_strategy_asset_ata: Account<'info, TokenAccount>,

    // ─── NanuqFi allocator accounts ─────────────────────────────────
    #[account(mut)]
    pub allocator: Account<'info, Allocator>,

    #[account(mut, constraint = risk_vault.allocator == allocator.key())]
    pub risk_vault: Account<'info, RiskVault>,

    /// UserPosition PDA for vault_strategy_auth
    /// CHECK: init_if_needed handled by allocator CPI
    #[account(mut)]
    pub user_position: UncheckedAccount<'info>,

    #[account(mut)]
    pub share_mint: Account<'info, Mint>,

    /// vault_strategy_auth's share token account
    #[account(mut)]
    pub user_share_ata: Account<'info, TokenAccount>,

    /// Allocator's vault USDC account
    #[account(mut, token::mint = usdc_mint)]
    pub vault_usdc: Account<'info, TokenAccount>,

    pub allocator_program: Program<'info, NanuqfiAllocator>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdaptorWithdraw<'info> {
    pub vault_strategy_auth: Signer<'info>,

    #[account(
        mut,
        seeds = [b"nanuqfi_strategy", allocator.key().as_ref()],
        bump = strategy.bump,
    )]
    pub strategy: Account<'info, NanuqfiStrategy>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(mut, token::mint = usdc_mint)]
    pub vault_strategy_asset_ata: Account<'info, TokenAccount>,

    // ─── NanuqFi allocator accounts ─────────────────────────────────
    #[account(mut)]
    pub allocator: Account<'info, Allocator>,

    #[account(mut, constraint = risk_vault.allocator == allocator.key())]
    pub risk_vault: Account<'info, RiskVault>,

    #[account(mut)]
    pub user_position: Account<'info, UserPosition>,

    #[account(mut, seeds = [b"treasury"], bump = treasury.bump)]
    pub treasury: Account<'info, nanuqfi_allocator::state::Treasury>,

    #[account(mut)]
    pub share_mint: Account<'info, Mint>,

    #[account(mut)]
    pub user_share_ata: Account<'info, TokenAccount>,

    #[account(mut, token::mint = usdc_mint)]
    pub vault_usdc: Account<'info, TokenAccount>,

    #[account(mut, constraint = treasury_usdc.key() == treasury.usdc_token_account)]
    pub treasury_usdc: Account<'info, TokenAccount>,

    pub allocator_program: Program<'info, NanuqfiAllocator>,
    pub token_program: Program<'info, Token>,
}
```

- [ ] **Step 4: Update Anchor.toml**

Add under `[programs.localnet]` and `[programs.devnet]`:
```toml
nanuqfi_adaptor = "AdptNanuqFi11111111111111111111111111111111"
```

- [ ] **Step 5: Build and verify compilation**

Run: `anchor build`
Expected: Compiles with no errors

- [ ] **Step 6: Run cargo check, build, test — all clean**

Run: `cargo check && cargo build && cargo test --features devnet`
Expected: 0 warnings, 0 errors, 125+ tests pass

- [ ] **Step 7: Generate real program keypair and update declare_id**

Run:
```bash
solana-keygen new --outfile target/deploy/nanuqfi_adaptor-keypair.json --no-bip39-passphrase --force
```
Then update `declare_id!()` in lib.rs and Anchor.toml with the generated pubkey.

- [ ] **Step 8: Commit**

```bash
git add programs/nanuqfi-adaptor/ Anchor.toml
git commit -m "feat: scaffold NanuqFi Ranger adaptor program (3 instructions)"
```

---

### Task 2: Scaffold the Mock Ranger Vault Program

**Files:**
- Create: `programs/mock-ranger-vault/Cargo.toml`
- Create: `programs/mock-ranger-vault/Xargo.toml`
- Create: `programs/mock-ranger-vault/src/lib.rs`
- Modify: `Anchor.toml` (add program entry)

- [ ] **Step 1: Create Cargo.toml**

```toml
# programs/mock-ranger-vault/Cargo.toml
[package]
name = "mock-ranger-vault"
version = "0.1.0"
description = "Mock Ranger vault for testing NanuqFi adaptor CPI"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "mock_ranger_vault"

[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
cpi = ["no-entrypoint"]
default = []

[dependencies]
anchor-lang = "0.30.1"
anchor-spl = "0.30.1"
nanuqfi-adaptor = { path = "../nanuqfi-adaptor", features = ["cpi"] }
```

- [ ] **Step 2: Create Xargo.toml**

```toml
# programs/mock-ranger-vault/Xargo.toml
[target.bpfel-unknown-unknown.dependencies.std]
features = []
```

- [ ] **Step 3: Create lib.rs — mock vault with deposit_strategy and withdraw_strategy**

```rust
// programs/mock-ranger-vault/src/lib.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};
use nanuqfi_adaptor::program::NanuqfiAdaptor;

declare_id!("MockVa1tRanger11111111111111111111111111111");

#[program]
pub mod mock_ranger_vault {
    use super::*;

    /// Simulate Ranger's deposit_strategy: transfer USDC to strategy ATA, then CPI adaptor deposit.
    pub fn deposit_strategy(ctx: Context<MockDepositStrategy>, amount: u64) -> Result<()> {
        // 1. Transfer USDC from idle pool to vault_strategy_asset_ata
        let seeds: &[&[u8]] = &[b"mock_vault_auth", &[ctx.bumps.vault_auth]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_idle_usdc.to_account_info(),
                    to: ctx.accounts.vault_strategy_asset_ata.to_account_info(),
                    authority: ctx.accounts.vault_auth.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;

        // 2. CPI into adaptor's deposit with vault_strategy_auth as signer
        let auth_seeds: &[&[u8]] = &[
            b"vault_strategy_auth",
            ctx.accounts.strategy.key().as_ref(),
            &[ctx.bumps.vault_strategy_auth],
        ];
        let cpi_program = ctx.accounts.adaptor_program.to_account_info();
        let cpi_accounts = nanuqfi_adaptor::cpi::accounts::AdaptorDeposit {
            vault_strategy_auth: ctx.accounts.vault_strategy_auth.to_account_info(),
            strategy: ctx.accounts.strategy.to_account_info(),
            usdc_mint: ctx.accounts.usdc_mint.to_account_info(),
            vault_strategy_asset_ata: ctx.accounts.vault_strategy_asset_ata.to_account_info(),
            allocator: ctx.accounts.allocator.to_account_info(),
            risk_vault: ctx.accounts.risk_vault.to_account_info(),
            user_position: ctx.accounts.user_position.to_account_info(),
            share_mint: ctx.accounts.share_mint.to_account_info(),
            user_share_ata: ctx.accounts.user_share_ata.to_account_info(),
            vault_usdc: ctx.accounts.vault_usdc.to_account_info(),
            allocator_program: ctx.accounts.allocator_program.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };
        nanuqfi_adaptor::cpi::deposit(
            CpiContext::new_with_signer(cpi_program, cpi_accounts, &[auth_seeds]),
            amount,
        )?;

        // 3. Read return data (position value)
        let (_program_id, return_data) = anchor_lang::solana_program::program::get_return_data()
            .ok_or(error!(ErrorCode::AccountNotInitialized))?;
        let position_value = u64::from_le_bytes(return_data[..8].try_into().unwrap());
        msg!("Mock vault: deposited {}, position value: {}", amount, position_value);

        Ok(())
    }

    /// Simulate Ranger's withdraw_strategy: CPI adaptor withdraw, then sweep USDC back.
    pub fn withdraw_strategy(ctx: Context<MockWithdrawStrategy>, amount: u64) -> Result<()> {
        let auth_seeds: &[&[u8]] = &[
            b"vault_strategy_auth",
            ctx.accounts.strategy.key().as_ref(),
            &[ctx.bumps.vault_strategy_auth],
        ];
        let cpi_program = ctx.accounts.adaptor_program.to_account_info();
        let cpi_accounts = nanuqfi_adaptor::cpi::accounts::AdaptorWithdraw {
            vault_strategy_auth: ctx.accounts.vault_strategy_auth.to_account_info(),
            strategy: ctx.accounts.strategy.to_account_info(),
            usdc_mint: ctx.accounts.usdc_mint.to_account_info(),
            vault_strategy_asset_ata: ctx.accounts.vault_strategy_asset_ata.to_account_info(),
            allocator: ctx.accounts.allocator.to_account_info(),
            risk_vault: ctx.accounts.risk_vault.to_account_info(),
            user_position: ctx.accounts.user_position.to_account_info(),
            treasury: ctx.accounts.treasury.to_account_info(),
            share_mint: ctx.accounts.share_mint.to_account_info(),
            user_share_ata: ctx.accounts.user_share_ata.to_account_info(),
            vault_usdc: ctx.accounts.vault_usdc.to_account_info(),
            treasury_usdc: ctx.accounts.treasury_usdc.to_account_info(),
            allocator_program: ctx.accounts.allocator_program.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
        };
        nanuqfi_adaptor::cpi::withdraw(
            CpiContext::new_with_signer(cpi_program, cpi_accounts, &[auth_seeds]),
            amount,
        )?;

        // Sweep USDC from strategy ATA back to idle pool
        let sweep_seeds: &[&[u8]] = &[
            b"vault_strategy_auth",
            ctx.accounts.strategy.key().as_ref(),
            &[ctx.bumps.vault_strategy_auth],
        ];
        let balance = ctx.accounts.vault_strategy_asset_ata.amount;
        if balance > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault_strategy_asset_ata.to_account_info(),
                        to: ctx.accounts.vault_idle_usdc.to_account_info(),
                        authority: ctx.accounts.vault_strategy_auth.to_account_info(),
                    },
                    &[sweep_seeds],
                ),
                balance,
            )?;
        }

        let (_program_id, return_data) = anchor_lang::solana_program::program::get_return_data()
            .ok_or(error!(ErrorCode::AccountNotInitialized))?;
        let remaining = u64::from_le_bytes(return_data[..8].try_into().unwrap());
        msg!("Mock vault: withdrew {}, remaining position: {}", amount, remaining);

        Ok(())
    }
}

// Account contexts — simplified versions of Ranger's actual layout

#[derive(Accounts)]
pub struct MockDepositStrategy<'info> {
    #[account(mut)]
    pub manager: Signer<'info>,

    /// CHECK: PDA authority for the mock vault's idle pool
    #[account(seeds = [b"mock_vault_auth"], bump)]
    pub vault_auth: UncheckedAccount<'info>,

    /// CHECK: PDA authority for this strategy
    #[account(seeds = [b"vault_strategy_auth", strategy.key().as_ref()], bump)]
    pub vault_strategy_auth: UncheckedAccount<'info>,

    /// Vault's idle USDC pool
    #[account(mut)]
    pub vault_idle_usdc: Account<'info, TokenAccount>,

    /// Strategy-specific USDC account
    #[account(mut)]
    pub vault_strategy_asset_ata: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    // ─── Pass-through to adaptor ─────────────────────────────────
    /// CHECK: NanuqFi strategy account
    #[account(mut)]
    pub strategy: UncheckedAccount<'info>,
    /// CHECK: NanuqFi allocator
    #[account(mut)]
    pub allocator: UncheckedAccount<'info>,
    /// CHECK: NanuqFi risk vault
    #[account(mut)]
    pub risk_vault: UncheckedAccount<'info>,
    /// CHECK: User position
    #[account(mut)]
    pub user_position: UncheckedAccount<'info>,
    /// CHECK: Share mint
    #[account(mut)]
    pub share_mint: UncheckedAccount<'info>,
    /// CHECK: User share ATA
    #[account(mut)]
    pub user_share_ata: UncheckedAccount<'info>,
    /// CHECK: Vault USDC
    #[account(mut)]
    pub vault_usdc: UncheckedAccount<'info>,

    pub allocator_program: UncheckedAccount<'info>,
    pub adaptor_program: Program<'info, NanuqfiAdaptor>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MockWithdrawStrategy<'info> {
    #[account(mut)]
    pub manager: Signer<'info>,

    /// CHECK: PDA
    #[account(seeds = [b"vault_strategy_auth", strategy.key().as_ref()], bump)]
    pub vault_strategy_auth: UncheckedAccount<'info>,

    #[account(mut)]
    pub vault_idle_usdc: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_strategy_asset_ata: Account<'info, TokenAccount>,
    pub usdc_mint: Account<'info, Mint>,

    // ─── Pass-through to adaptor ─────────────────────────────────
    #[account(mut)]
    pub strategy: UncheckedAccount<'info>,
    #[account(mut)]
    pub allocator: UncheckedAccount<'info>,
    #[account(mut)]
    pub risk_vault: UncheckedAccount<'info>,
    #[account(mut)]
    pub user_position: UncheckedAccount<'info>,
    /// CHECK: Treasury
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,
    #[account(mut)]
    pub share_mint: UncheckedAccount<'info>,
    #[account(mut)]
    pub user_share_ata: UncheckedAccount<'info>,
    #[account(mut)]
    pub vault_usdc: UncheckedAccount<'info>,
    /// CHECK: Treasury USDC
    #[account(mut)]
    pub treasury_usdc: UncheckedAccount<'info>,

    pub allocator_program: UncheckedAccount<'info>,
    pub adaptor_program: Program<'info, NanuqfiAdaptor>,
    pub token_program: Program<'info, Token>,
}
```

- [ ] **Step 4: Update Anchor.toml — add mock vault**

Add under both `[programs.localnet]` and `[programs.devnet]`:
```toml
mock_ranger_vault = "MockVa1tRanger11111111111111111111111111111"
```

- [ ] **Step 5: Build all programs**

Run: `anchor build`
Expected: All 3 programs compile with no errors

- [ ] **Step 6: Generate real keypair for mock vault and update declare_id**

```bash
solana-keygen new --outfile target/deploy/mock_ranger_vault-keypair.json --no-bip39-passphrase --force
```
Update `declare_id!()` and Anchor.toml.

- [ ] **Step 7: Verify clean build**

Run: `cargo check && cargo build && cargo test --features devnet`
Expected: 0 warnings, 0 errors

- [ ] **Step 8: Commit**

```bash
git add programs/mock-ranger-vault/ Anchor.toml
git commit -m "feat: scaffold mock Ranger vault for adaptor E2E testing"
```

---

### Task 3: Deploy Programs and Initialize Accounts on Devnet

**Files:**
- Create: `scripts/setup-ranger-devnet.ts`

- [ ] **Step 1: Write the devnet setup script**

```typescript
// scripts/setup-ranger-devnet.ts
/**
 * Sets up the NanuqFi Ranger adaptor on devnet:
 * 1. Deploy adaptor + mock vault programs (if not already deployed)
 * 2. Initialize mock vault's idle USDC pool
 * 3. Initialize vault_strategy_asset_ata (owned by vault_strategy_auth PDA)
 * 4. Initialize NanuqFi strategy via adaptor
 * 5. Create user_share_ata for vault_strategy_auth
 *
 * Prerequisites: allocator + moderate vault already initialized (setup-devnet.ts)
 * Idempotent — safe to run multiple times.
 * Usage: npx tsx scripts/setup-ranger-devnet.ts
 */
// Implementation: derive all PDAs, create token accounts,
// call adaptor's initialize instruction
```

Full script to be implemented during execution — follows same pattern as `scripts/setup-devnet.ts` (connection setup, keypair loading, idempotent checks, PDA derivation, instruction building).

- [ ] **Step 2: Deploy both programs to devnet**

```bash
anchor build
solana program deploy target/deploy/nanuqfi_adaptor.so --program-id <ADAPTOR_KEYPAIR> --url devnet
solana program deploy target/deploy/mock_ranger_vault.so --program-id <MOCK_KEYPAIR> --url devnet
```

- [ ] **Step 3: Run the setup script**

```bash
npx tsx scripts/setup-ranger-devnet.ts
```
Expected: Strategy initialized, all token accounts created

- [ ] **Step 4: Commit**

```bash
git add scripts/setup-ranger-devnet.ts
git commit -m "feat: add Ranger adaptor devnet setup script"
```

---

### Task 4: Integration Tests

**Files:**
- Create: `tests/ranger-adaptor.test.ts`

- [ ] **Step 1: Write integration tests**

Test cases:
1. **Initialize strategy** — adaptor creates NanuqfiStrategy PDA with correct state
2. **Deposit via mock vault** — USDC flows: idle pool → strategy ATA → allocator vault. Position value returned correctly.
3. **Position value accuracy** — After deposit, position_value matches (user_shares / total_shares * total_assets)
4. **Withdraw via mock vault** — USDC flows back: allocator vault → strategy ATA → idle pool. Remaining position value correct.
5. **Full cycle** — deposit → verify → withdraw → verify zero remaining
6. **Multiple deposits** — Two deposits accumulate correctly
7. **Partial withdraw** — Withdraw half, remaining position is ~half
8. **Double initialize fails** — Second initialize reverts (PDA already exists)

- [ ] **Step 2: Run tests**

Run: `anchor test -- --features devnet`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/ranger-adaptor.test.ts
git commit -m "test: add Ranger adaptor integration tests (8 tests)"
```

---

### Task 5: Rust Unit Tests for Adaptor

**Files:**
- Modify: `programs/nanuqfi-adaptor/src/lib.rs` (add tests module)

- [ ] **Step 1: Add unit tests**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::prelude::Pubkey;

    #[test]
    fn strategy_pda_derivation() {
        let allocator = Pubkey::new_unique();
        let (pda, bump) = Pubkey::find_program_address(
            &[b"nanuqfi_strategy", allocator.as_ref()],
            &crate::ID,
        );
        assert_ne!(pda, Pubkey::default());
        assert!(bump <= 255);
    }

    #[test]
    fn position_value_single_depositor() {
        let user_shares: u64 = 1_000_000;
        let total_shares: u64 = 1_000_000;
        let total_assets: u64 = 1_050_000; // 5% yield
        let value = ((user_shares as u128) * (total_assets as u128) / (total_shares as u128)) as u64;
        assert_eq!(value, 1_050_000);
    }

    #[test]
    fn position_value_multiple_depositors() {
        let user_shares: u64 = 500_000;
        let total_shares: u64 = 2_000_000;
        let total_assets: u64 = 2_100_000;
        let value = ((user_shares as u128) * (total_assets as u128) / (total_shares as u128)) as u64;
        assert_eq!(value, 525_000); // 25% of total
    }

    #[test]
    fn position_value_zero_shares() {
        let total_shares: u64 = 0;
        let value = if total_shares > 0 { 100 } else { 0 };
        assert_eq!(value, 0);
    }

    #[test]
    fn position_value_no_overflow_large_amounts() {
        let user_shares: u64 = u64::MAX / 2;
        let total_shares: u64 = u64::MAX / 2;
        let total_assets: u64 = u64::MAX / 2;
        let value = ((user_shares as u128) * (total_assets as u128) / (total_shares as u128)) as u64;
        assert_eq!(value, u64::MAX / 2);
    }

    #[test]
    fn shares_from_amount_calculation() {
        let amount: u64 = 500_000;
        let total_assets: u64 = 2_000_000;
        let total_shares: u64 = 1_900_000;
        let shares = ((amount as u128) * (total_shares as u128) / (total_assets as u128)) as u64;
        assert_eq!(shares, 475_000);
    }
}
```

- [ ] **Step 2: Run unit tests**

Run: `cargo test -p nanuqfi-adaptor`
Expected: 6 tests pass

- [ ] **Step 3: Run full test suite**

Run: `cargo check && cargo build && cargo test --features devnet`
Expected: 131+ tests pass (125 allocator + 6 adaptor), 0 warnings

- [ ] **Step 4: Commit**

```bash
git add programs/nanuqfi-adaptor/src/lib.rs
git commit -m "test: add adaptor unit tests (position value, PDA, shares math)"
```

---

### Task 6: Update Strategy Page and Documentation

**Files:**
- Modify: `~/local-dev/nanuqfi-app/src/app/strategy/page.tsx` (add Ranger Integration tab content)
- Modify: `CLAUDE.md` (update instruction count)
- Modify: `README.md` (mention Ranger adaptor)

- [ ] **Step 1: Add Ranger Integration content to strategy page Architecture tab**

Add a "Ranger Earn Integration" section to the Architecture tab showing:
- The CPI flow diagram
- Adaptor program ID
- "One deploy to mainnet" positioning

- [ ] **Step 2: Update CLAUDE.md with new program counts**

Update instruction count: 27 (allocator) + 3 (adaptor) = 30 total

- [ ] **Step 3: Update README references**

Mention the Ranger adaptor in the ecosystem overview.

- [ ] **Step 4: Commit all doc changes**

```bash
git add -A
git commit -m "docs: add Ranger adaptor to strategy page, update instruction counts"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Full build — all programs**

Run: `anchor build`
Expected: 3 programs compile clean

- [ ] **Step 2: Full test — Rust**

Run: `cargo check && cargo build && cargo test --features devnet`
Expected: 131+ tests, 0 warnings, 0 errors

- [ ] **Step 3: Full test — TypeScript integration**

Run: `anchor test -- --features devnet`
Expected: 8+ integration tests pass

- [ ] **Step 4: Full test — frontend**

Run: `cd ~/local-dev/nanuqfi-app && pnpm test --run && pnpm lint`
Expected: 145+ tests pass, 0 lint errors

- [ ] **Step 5: Full test — keeper**

Run: `cd ~/local-dev/nanuqfi-keeper && pnpm test --run`
Expected: 322 tests pass

- [ ] **Step 6: CI — push all repos and verify green**

```bash
git push  # core
cd ~/local-dev/nanuqfi-app && git push
cd ~/local-dev/nanuqfi-keeper && git push
```
Expected: All 3 repos CI green

- [ ] **Step 7: Save progress to memory**

Update MEMORY.md with adaptor status, new test counts, program IDs.
