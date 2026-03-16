use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
  hash::hash,
  instruction::{AccountMeta, Instruction},
  program::invoke_signed,
  sysvar,
};
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};

pub mod errors;
pub mod state;

use errors::AllocatorError;
use state::*;

declare_id!("2QtJ5kmxLuW2jYCFpJMtzZ7PCnKdoMwkeueYoDUi5z5P");

// ═══════════════════════════════════════════════════════════════════════════
// Drift Protocol Constants & Helpers
// ═══════════════════════════════════════════════════════════════════════════

/// Drift Protocol v2 program ID (same on devnet and mainnet).
const DRIFT_PROGRAM_ID: Pubkey = pubkey!("dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH");

/// Compute Anchor-style 8-byte discriminator for a Drift instruction.
fn anchor_discriminator(instruction_name: &str) -> [u8; 8] {
  let preimage = format!("global:{}", instruction_name);
  let h = hash(preimage.as_bytes());
  let mut disc = [0u8; 8];
  disc.copy_from_slice(&h.to_bytes()[..8]);
  disc
}

/// Management fee: 1% annualized.
/// Solana produces ~2 slots/sec → ~63_072_000 slots/year.
/// Fee per slot in bps numerator: 10_000 (1%) * 1_000_000 (precision) / 63_072_000
const MGMT_FEE_PER_SLOT_SCALED: u64 = 158_548; // ~0.000158548 bps per slot, 1e6 precision
const MGMT_FEE_PRECISION: u64 = 1_000_000;

/// Performance fee: 10% of gains above HWM (in bps).
const PERFORMANCE_FEE_BPS: u64 = 1000;
const BPS_DENOMINATOR: u64 = 10_000;

/// Share price precision (6 decimals, matching USDC).
const SHARE_PRICE_PRECISION: u64 = 1_000_000;

/// Minimum rebalance interval (~1 hour at ~2 slots/sec).
const MIN_REBALANCE_INTERVAL_SLOTS: u64 = 9_000;

/// Maximum weight shift per rebalance: 20% = 2000 bps.
const MAX_SHIFT_BPS: u16 = 2_000;

/// Oracle divergence threshold: 1% = 100 bps.
const ORACLE_DIVERGENCE_BPS: u64 = 100;

/// TVL emergency halt threshold: 85%.
const TVL_HALT_THRESHOLD_BPS: u64 = 8_500;

/// Equity snapshot refresh interval: ~24h at ~2 slots/sec.
const EQUITY_SNAPSHOT_INTERVAL: u64 = 216_000;

/// Keeper lease duration: ~5 minutes at ~2 slots/sec.
const LEASE_DURATION_SLOTS: u64 = 600;

#[program]
pub mod nanuqfi_allocator {
  use super::*;

  pub fn initialize_allocator(ctx: Context<InitializeAllocator>) -> Result<()> {
    let allocator = &mut ctx.accounts.allocator;
    allocator.admin = ctx.accounts.admin.key();
    allocator.keeper_authority = ctx.accounts.keeper_authority.key();
    allocator.total_tvl = 0;
    allocator.halted = false;
    allocator.bump = ctx.bumps.allocator;
    Ok(())
  }

  pub fn initialize_risk_vault(
    ctx: Context<InitializeRiskVault>,
    risk_level: RiskLevel,
    max_perp_bps: u16,
    max_lending_bps: u16,
    max_single_asset_bps: u16,
    max_drawdown_bps: u16,
    max_leverage_bps: u16,
    redemption_period_slots: u64,
    deposit_cap: u64,
  ) -> Result<()> {
    let vault = &mut ctx.accounts.risk_vault;
    vault.allocator = ctx.accounts.allocator.key();
    vault.risk_level = risk_level;
    vault.drift_vault = ctx.accounts.drift_vault.key();
    vault.share_mint = ctx.accounts.share_mint.key();
    vault.total_shares = 0;
    vault.total_assets = 0;
    vault.peak_equity = 0;
    vault.current_equity = 0;
    vault.equity_24h_ago = 0;
    vault.last_rebalance_slot = 0;
    vault.rebalance_counter = 0;
    vault.last_mgmt_fee_slot = Clock::get()?.slot;
    vault.current_weights = vec![];
    vault.max_perp_allocation_bps = max_perp_bps;
    vault.max_lending_allocation_bps = max_lending_bps;
    vault.max_single_asset_bps = max_single_asset_bps;
    vault.max_drawdown_bps = max_drawdown_bps;
    vault.max_leverage_bps = max_leverage_bps;
    vault.redemption_period_slots = redemption_period_slots;
    vault.deposit_cap = deposit_cap;
    vault.bump = ctx.bumps.risk_vault;
    Ok(())
  }

  // ─── 1. Initialize Treasury ───────────────────────────────────────────

  pub fn initialize_treasury(ctx: Context<InitializeTreasury>) -> Result<()> {
    let treasury = &mut ctx.accounts.treasury;
    treasury.allocator = ctx.accounts.allocator.key();
    treasury.usdc_token_account = ctx.accounts.treasury_usdc.key();
    treasury.total_fees_collected = 0;
    treasury.bump = ctx.bumps.treasury;
    Ok(())
  }

  // ─── 2. Deposit ───────────────────────────────────────────────────────

  pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(!ctx.accounts.allocator.halted, AllocatorError::AllocatorHalted);
    require!(amount > 0, AllocatorError::InsufficientBalance);

    // Deposit cap check (0 = uncapped)
    let deposit_cap = ctx.accounts.risk_vault.deposit_cap;
    let total_assets = ctx.accounts.risk_vault.total_assets;
    if deposit_cap > 0 {
      require!(
        total_assets
          .checked_add(amount)
          .ok_or(AllocatorError::MathOverflow)?
          <= deposit_cap,
        AllocatorError::DepositCapExceeded
      );
    }

    let vault = &mut ctx.accounts.risk_vault;

    // ERC-4626 share pricing
    let shares = if vault.total_shares == 0 {
      // First deposit: 1:1
      amount
    } else {
      amount
        .checked_mul(vault.total_shares)
        .ok_or(AllocatorError::MathOverflow)?
        .checked_div(vault.total_assets)
        .ok_or(AllocatorError::MathOverflow)?
    };

    require!(shares > 0, AllocatorError::MathOverflow);

    // Transfer USDC from user to vault token account
    token::transfer(
      CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
          from: ctx.accounts.user_usdc.to_account_info(),
          to: ctx.accounts.vault_usdc.to_account_info(),
          authority: ctx.accounts.user.to_account_info(),
        },
      ),
      amount,
    )?;

    // Mint share tokens to user (allocator PDA as mint authority)
    let allocator_bump = ctx.accounts.allocator.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[b"allocator".as_ref(), &[allocator_bump]]];

    token::mint_to(
      CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        MintTo {
          mint: ctx.accounts.share_mint.to_account_info(),
          to: ctx.accounts.user_shares.to_account_info(),
          authority: ctx.accounts.allocator.to_account_info(),
        },
        signer_seeds,
      ),
      shares,
    )?;

    // Update vault totals
    vault.total_shares = vault
      .total_shares
      .checked_add(shares)
      .ok_or(AllocatorError::MathOverflow)?;
    vault.total_assets = vault
      .total_assets
      .checked_add(amount)
      .ok_or(AllocatorError::MathOverflow)?;

    // Update allocator TVL
    let allocator = &mut ctx.accounts.allocator;
    allocator.total_tvl = allocator
      .total_tvl
      .checked_add(amount)
      .ok_or(AllocatorError::MathOverflow)?;

    // Create/update UserPosition
    let position = &mut ctx.accounts.user_position;
    let clock = Clock::get()?;

    if position.user == Pubkey::default() {
      // First-time initialization
      position.user = ctx.accounts.user.key();
      position.risk_vault = vault.key();
      position.entry_slot = clock.slot;
      position.pending_withdrawal_shares = 0;
      position.withdraw_request_slot = 0;
      position.request_time_share_price = 0;
      position.bump = ctx.bumps.user_position;
    }

    position.shares = position
      .shares
      .checked_add(shares)
      .ok_or(AllocatorError::MathOverflow)?;
    position.deposited_usdc = position
      .deposited_usdc
      .checked_add(amount)
      .ok_or(AllocatorError::MathOverflow)?;

    // Update HWM price: current share price after deposit
    let current_price = vault
      .total_assets
      .checked_mul(SHARE_PRICE_PRECISION)
      .ok_or(AllocatorError::MathOverflow)?
      .checked_div(vault.total_shares)
      .ok_or(AllocatorError::MathOverflow)?;

    // HWM only goes up — use max of existing vs current
    if current_price > position.high_water_mark_price {
      position.high_water_mark_price = current_price;
    }

    Ok(())
  }

  // ─── 3. Request Withdraw ──────────────────────────────────────────────

  pub fn request_withdraw(ctx: Context<RequestWithdraw>, shares: u64) -> Result<()> {
    let position = &mut ctx.accounts.user_position;
    let vault = &ctx.accounts.risk_vault;

    // Verify no existing pending withdrawal
    require!(
      position.pending_withdrawal_shares == 0,
      AllocatorError::HasPendingWithdrawal
    );

    // Verify user has enough shares
    require!(
      position.shares >= shares,
      AllocatorError::InsufficientBalance
    );

    require!(shares > 0, AllocatorError::InsufficientBalance);

    let clock = Clock::get()?;

    // Record pending withdrawal
    position.pending_withdrawal_shares = shares;
    position.withdraw_request_slot = clock.slot;

    // Calculate and store request-time share price
    position.request_time_share_price = if vault.total_shares > 0 {
      vault
        .total_assets
        .checked_mul(SHARE_PRICE_PRECISION)
        .ok_or(AllocatorError::MathOverflow)?
        .checked_div(vault.total_shares)
        .ok_or(AllocatorError::MathOverflow)?
    } else {
      SHARE_PRICE_PRECISION // 1:1 fallback
    };

    Ok(())
  }

  // ─── 4. Withdraw (Two-Phase Completion) ───────────────────────────────

  pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
    let position = &mut ctx.accounts.user_position;
    let vault = &mut ctx.accounts.risk_vault;
    let allocator = &ctx.accounts.allocator;

    let shares = position.pending_withdrawal_shares;
    require!(shares > 0, AllocatorError::NoPendingWithdrawal);

    let clock = Clock::get()?;

    // Check redemption period (waived if halted — emergency exit)
    if !allocator.halted {
      let elapsed = clock
        .slot
        .checked_sub(position.withdraw_request_slot)
        .ok_or(AllocatorError::MathOverflow)?;
      require!(
        elapsed >= vault.redemption_period_slots,
        AllocatorError::RedemptionPeriodNotElapsed
      );
    }

    // Current share price
    let current_price = if vault.total_shares > 0 {
      vault
        .total_assets
        .checked_mul(SHARE_PRICE_PRECISION)
        .ok_or(AllocatorError::MathOverflow)?
        .checked_div(vault.total_shares)
        .ok_or(AllocatorError::MathOverflow)?
    } else {
      SHARE_PRICE_PRECISION
    };

    // Worse-of pricing: min(current, request-time)
    let effective_price = current_price.min(position.request_time_share_price);

    // Gross USDC value of shares being redeemed
    let gross_usdc = shares
      .checked_mul(effective_price)
      .ok_or(AllocatorError::MathOverflow)?
      .checked_div(SHARE_PRICE_PRECISION)
      .ok_or(AllocatorError::MathOverflow)?;

    // Performance fee: 10% of gains above HWM
    let performance_fee = if effective_price > position.high_water_mark_price {
      let gain_per_share = effective_price
        .checked_sub(position.high_water_mark_price)
        .ok_or(AllocatorError::MathOverflow)?;
      let total_gain = shares
        .checked_mul(gain_per_share)
        .ok_or(AllocatorError::MathOverflow)?
        .checked_div(SHARE_PRICE_PRECISION)
        .ok_or(AllocatorError::MathOverflow)?;
      total_gain
        .checked_mul(PERFORMANCE_FEE_BPS)
        .ok_or(AllocatorError::MathOverflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(AllocatorError::MathOverflow)?
    } else {
      0
    };

    let net_usdc = gross_usdc
      .checked_sub(performance_fee)
      .ok_or(AllocatorError::MathOverflow)?;

    // Verify vault has enough USDC
    require!(
      ctx.accounts.vault_usdc.amount >= net_usdc.checked_add(performance_fee).ok_or(AllocatorError::MathOverflow)?,
      AllocatorError::InsufficientBalance
    );

    let allocator_bump = allocator.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[b"allocator".as_ref(), &[allocator_bump]]];

    // Burn shares from user (user is the authority over their own token account)
    token::burn(
      CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Burn {
          mint: ctx.accounts.share_mint.to_account_info(),
          from: ctx.accounts.user_shares.to_account_info(),
          authority: ctx.accounts.user.to_account_info(),
        },
      ),
      shares,
    )?;

    // Transfer net USDC to user
    if net_usdc > 0 {
      token::transfer(
        CpiContext::new_with_signer(
          ctx.accounts.token_program.to_account_info(),
          Transfer {
            from: ctx.accounts.vault_usdc.to_account_info(),
            to: ctx.accounts.user_usdc.to_account_info(),
            authority: ctx.accounts.allocator.to_account_info(),
          },
          signer_seeds,
        ),
        net_usdc,
      )?;
    }

    // Transfer performance fee to treasury
    if performance_fee > 0 {
      token::transfer(
        CpiContext::new_with_signer(
          ctx.accounts.token_program.to_account_info(),
          Transfer {
            from: ctx.accounts.vault_usdc.to_account_info(),
            to: ctx.accounts.treasury_usdc.to_account_info(),
            authority: ctx.accounts.allocator.to_account_info(),
          },
          signer_seeds,
        ),
        performance_fee,
      )?;

      // Update treasury fee counter
      let treasury = &mut ctx.accounts.treasury;
      treasury.total_fees_collected = treasury
        .total_fees_collected
        .checked_add(performance_fee)
        .ok_or(AllocatorError::MathOverflow)?;
    }

    // Update vault totals
    vault.total_shares = vault
      .total_shares
      .checked_sub(shares)
      .ok_or(AllocatorError::MathOverflow)?;
    vault.total_assets = vault
      .total_assets
      .checked_sub(gross_usdc)
      .ok_or(AllocatorError::MathOverflow)?;

    // Update allocator TVL
    let allocator_account = &mut ctx.accounts.allocator;
    allocator_account.total_tvl = allocator_account
      .total_tvl
      .saturating_sub(gross_usdc);

    // Update position
    position.shares = position
      .shares
      .checked_sub(shares)
      .ok_or(AllocatorError::MathOverflow)?;
    position.pending_withdrawal_shares = 0;
    position.withdraw_request_slot = 0;
    position.request_time_share_price = 0;

    // Update HWM to current price if still has shares
    if position.shares > 0 && vault.total_shares > 0 {
      let new_price = vault
        .total_assets
        .checked_mul(SHARE_PRICE_PRECISION)
        .ok_or(AllocatorError::MathOverflow)?
        .checked_div(vault.total_shares)
        .ok_or(AllocatorError::MathOverflow)?;
      position.high_water_mark_price = new_price;
    }

    Ok(())
  }

  // ─── 5. Rebalance ─────────────────────────────────────────────────────

  pub fn rebalance(
    ctx: Context<Rebalance>,
    new_weights: Vec<u16>,
    equity_snapshot: u64,
    ai_reasoning_hash: Vec<u8>,
  ) -> Result<()> {
    let vault = &mut ctx.accounts.risk_vault;
    let allocator = &ctx.accounts.allocator;
    let clock = Clock::get()?;

    // 1. Verify not halted
    require!(!allocator.halted, AllocatorError::AllocatorHalted);

    // 2. Verify minimum rebalance interval
    let slots_since_last = clock
      .slot
      .checked_sub(vault.last_rebalance_slot)
      .ok_or(AllocatorError::MathOverflow)?;
    require!(
      slots_since_last >= MIN_REBALANCE_INTERVAL_SLOTS,
      AllocatorError::RebalanceTooSoon
    );

    // 3. Validate weights sum to 10000 bps
    let weight_sum: u32 = new_weights.iter().map(|w| *w as u32).sum();
    require!(weight_sum == 10_000, AllocatorError::InvalidWeightSum);

    // 4. Validate perp allocation cap
    // Convention: first weight is perp allocation
    if !new_weights.is_empty() {
      require!(
        new_weights[0] <= vault.max_perp_allocation_bps,
        AllocatorError::WeightExceedsMax
      );
    }

    // 5. Validate single asset cap
    for w in &new_weights {
      require!(
        *w <= vault.max_single_asset_bps,
        AllocatorError::WeightExceedsMax
      );
    }

    // 6. Validate max 20% shift per rebalance
    if !vault.current_weights.is_empty() {
      let max_len = vault.current_weights.len().max(new_weights.len());
      for i in 0..max_len {
        let old_w = if i < vault.current_weights.len() {
          vault.current_weights[i]
        } else {
          0
        };
        let new_w = if i < new_weights.len() {
          new_weights[i]
        } else {
          0
        };
        let diff = if new_w > old_w {
          new_w - old_w
        } else {
          old_w - new_w
        };
        require!(diff <= MAX_SHIFT_BPS, AllocatorError::ShiftTooLarge);
      }
    }

    // 7. Check equity_snapshot divergence <= 1% from total_assets (oracle placeholder)
    if vault.total_assets > 0 {
      let divergence = if equity_snapshot > vault.total_assets {
        equity_snapshot
          .checked_sub(vault.total_assets)
          .ok_or(AllocatorError::MathOverflow)?
      } else {
        vault
          .total_assets
          .checked_sub(equity_snapshot)
          .ok_or(AllocatorError::MathOverflow)?
      };
      let threshold = vault
        .total_assets
        .checked_mul(ORACLE_DIVERGENCE_BPS)
        .ok_or(AllocatorError::MathOverflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(AllocatorError::MathOverflow)?;
      require!(divergence <= threshold, AllocatorError::OracleDivergence);
    }

    // 8. Check drawdown against max_drawdown_bps
    if vault.peak_equity > 0 && equity_snapshot < vault.peak_equity {
      let drawdown_amount = vault
        .peak_equity
        .checked_sub(equity_snapshot)
        .ok_or(AllocatorError::MathOverflow)?;
      let drawdown_bps = drawdown_amount
        .checked_mul(BPS_DENOMINATOR)
        .ok_or(AllocatorError::MathOverflow)?
        .checked_div(vault.peak_equity)
        .ok_or(AllocatorError::MathOverflow)?;
      require!(
        drawdown_bps <= vault.max_drawdown_bps as u64,
        AllocatorError::DrawdownExceeded
      );
    }

    // 9. TVL emergency halt: if equity / equity_24h_ago < 85% → auto-halt
    if vault.equity_24h_ago > 0 {
      let ratio_bps = equity_snapshot
        .checked_mul(BPS_DENOMINATOR)
        .ok_or(AllocatorError::MathOverflow)?
        .checked_div(vault.equity_24h_ago)
        .ok_or(AllocatorError::MathOverflow)?;
      if ratio_bps < TVL_HALT_THRESHOLD_BPS {
        let allocator_mut = &mut ctx.accounts.allocator;
        allocator_mut.halted = true;
        msg!("EMERGENCY HALT: TVL dropped below 85% of 24h ago");
        return Ok(());
      }
    }

    // 10. Accrue management fee (1% annualized, per-slot)
    let slots_since_fee = clock
      .slot
      .checked_sub(vault.last_mgmt_fee_slot)
      .ok_or(AllocatorError::MathOverflow)?;

    if slots_since_fee > 0 && vault.total_assets > 0 {
      let fee = vault
        .total_assets
        .checked_mul(slots_since_fee)
        .ok_or(AllocatorError::MathOverflow)?
        .checked_mul(MGMT_FEE_PER_SLOT_SCALED)
        .ok_or(AllocatorError::MathOverflow)?
        .checked_div(
          MGMT_FEE_PRECISION
            .checked_mul(BPS_DENOMINATOR)
            .ok_or(AllocatorError::MathOverflow)?,
        )
        .ok_or(AllocatorError::MathOverflow)?;

      if fee > 0 {
        let allocator_bump = allocator.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[b"allocator".as_ref(), &[allocator_bump]]];

        // Transfer management fee to treasury
        let transfer_fee = fee.min(ctx.accounts.vault_usdc.amount);
        if transfer_fee > 0 {
          token::transfer(
            CpiContext::new_with_signer(
              ctx.accounts.token_program.to_account_info(),
              Transfer {
                from: ctx.accounts.vault_usdc.to_account_info(),
                to: ctx.accounts.treasury_usdc.to_account_info(),
                authority: ctx.accounts.allocator.to_account_info(),
              },
              signer_seeds,
            ),
            transfer_fee,
          )?;

          vault.total_assets = vault
            .total_assets
            .saturating_sub(transfer_fee);

          let treasury = &mut ctx.accounts.treasury;
          treasury.total_fees_collected = treasury
            .total_fees_collected
            .checked_add(transfer_fee)
            .ok_or(AllocatorError::MathOverflow)?;
        }
      }
    }

    vault.last_mgmt_fee_slot = clock.slot;

    // 11. Update equity_24h_ago periodically
    if vault.equity_24h_ago == 0
      || clock.slot.saturating_sub(vault.last_rebalance_slot) >= EQUITY_SNAPSHOT_INTERVAL
    {
      vault.equity_24h_ago = equity_snapshot;
    }

    // 12. Record RebalanceRecord
    let record = &mut ctx.accounts.rebalance_record;
    record.risk_vault = vault.key();
    record.counter = vault.rebalance_counter;
    record.slot = clock.slot;
    record.previous_weights = vault.current_weights.clone();
    record.new_weights = new_weights.clone();
    record.ai_reasoning_hash = ai_reasoning_hash;
    record.approved = true;
    record.bump = ctx.bumps.rebalance_record;

    // 13. Update vault state
    vault.current_weights = new_weights;
    vault.current_equity = equity_snapshot;
    if equity_snapshot > vault.peak_equity {
      vault.peak_equity = equity_snapshot;
    }
    vault.last_rebalance_slot = clock.slot;
    vault.rebalance_counter = vault
      .rebalance_counter
      .checked_add(1)
      .ok_or(AllocatorError::MathOverflow)?;

    Ok(())
  }

  // ─── 6. Emergency Halt ────────────────────────────────────────────────

  pub fn emergency_halt(ctx: Context<EmergencyHalt>) -> Result<()> {
    ctx.accounts.allocator.halted = true;
    msg!("Allocator halted by admin");
    Ok(())
  }

  // ─── 7. Resume ────────────────────────────────────────────────────────

  pub fn resume(ctx: Context<Resume>) -> Result<()> {
    ctx.accounts.allocator.halted = false;
    msg!("Allocator resumed by admin");
    Ok(())
  }

  // ─── 8. Update Keeper Authority ───────────────────────────────────────

  pub fn update_keeper_authority(ctx: Context<UpdateKeeperAuthority>) -> Result<()> {
    ctx.accounts.allocator.keeper_authority = ctx.accounts.new_keeper_authority.key();
    msg!("Keeper authority updated");
    Ok(())
  }

  // ─── 9. Update Guardrails (Tighten-Only) ──────────────────────────────

  pub fn update_guardrails(
    ctx: Context<UpdateGuardrails>,
    new_max_perp_bps: u16,
    new_max_lending_bps: u16,
    new_max_single_asset_bps: u16,
    new_max_drawdown_bps: u16,
    new_max_leverage_bps: u16,
    new_redemption_period_slots: u64,
  ) -> Result<()> {
    let vault = &mut ctx.accounts.risk_vault;

    // Tighten-only: caps can only decrease, redemption period can only increase
    require!(
      new_max_perp_bps <= vault.max_perp_allocation_bps,
      AllocatorError::CannotLoosenGuardrails
    );
    require!(
      new_max_lending_bps <= vault.max_lending_allocation_bps,
      AllocatorError::CannotLoosenGuardrails
    );
    require!(
      new_max_single_asset_bps <= vault.max_single_asset_bps,
      AllocatorError::CannotLoosenGuardrails
    );
    require!(
      new_max_drawdown_bps <= vault.max_drawdown_bps,
      AllocatorError::CannotLoosenGuardrails
    );
    require!(
      new_max_leverage_bps <= vault.max_leverage_bps,
      AllocatorError::CannotLoosenGuardrails
    );
    require!(
      new_redemption_period_slots >= vault.redemption_period_slots,
      AllocatorError::CannotLoosenGuardrails
    );

    vault.max_perp_allocation_bps = new_max_perp_bps;
    vault.max_lending_allocation_bps = new_max_lending_bps;
    vault.max_single_asset_bps = new_max_single_asset_bps;
    vault.max_drawdown_bps = new_max_drawdown_bps;
    vault.max_leverage_bps = new_max_leverage_bps;
    vault.redemption_period_slots = new_redemption_period_slots;

    msg!("Guardrails tightened");
    Ok(())
  }

  // ─── 10. Acquire Lease ────────────────────────────────────────────────

  pub fn acquire_lease(ctx: Context<AcquireLease>) -> Result<()> {
    let lease = &mut ctx.accounts.keeper_lease;
    let clock = Clock::get()?;

    // If lease exists and hasn't expired, reject
    if lease.keeper != Pubkey::default() && lease.lease_expiry_slot > clock.slot {
      return Err(AllocatorError::LeaseConflict.into());
    }

    lease.keeper = ctx.accounts.keeper_authority.key();
    lease.lease_expiry_slot = clock
      .slot
      .checked_add(LEASE_DURATION_SLOTS)
      .ok_or(AllocatorError::MathOverflow)?;
    lease.heartbeat_slot = clock.slot;
    lease.bump = ctx.bumps.keeper_lease;

    msg!("Keeper lease acquired");
    Ok(())
  }

  // ─── 11. Heartbeat ────────────────────────────────────────────────────

  pub fn heartbeat(ctx: Context<Heartbeat>) -> Result<()> {
    let lease = &mut ctx.accounts.keeper_lease;
    let clock = Clock::get()?;

    lease.heartbeat_slot = clock.slot;
    lease.lease_expiry_slot = clock
      .slot
      .checked_add(LEASE_DURATION_SLOTS)
      .ok_or(AllocatorError::MathOverflow)?;

    Ok(())
  }

  // ─── 12. Withdraw Treasury ────────────────────────────────────────────

  pub fn withdraw_treasury(ctx: Context<WithdrawTreasury>, amount: u64) -> Result<()> {
    require!(amount > 0, AllocatorError::InsufficientBalance);
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
    treasury.total_fees_collected = treasury
      .total_fees_collected
      .saturating_sub(amount);

    msg!("Treasury withdrawal: {} USDC", amount);
    Ok(())
  }

  // ─── 13. Update Deposit Cap ─────────────────────────────────────────

  pub fn update_deposit_cap(ctx: Context<UpdateDepositCap>, new_cap: u64) -> Result<()> {
    let vault = &mut ctx.accounts.risk_vault;
    vault.deposit_cap = new_cap;
    Ok(())
  }

  // ─── 14. Allocate to Drift (Real CPI) ───────────────────────────────

  pub fn allocate_to_drift(ctx: Context<AllocateToDrift>, amount: u64) -> Result<()> {
    let allocator = &ctx.accounts.allocator;
    require!(!allocator.halted, AllocatorError::AllocatorHalted);
    require!(amount > 0, AllocatorError::InsufficientBalance);
    require!(
      ctx.accounts.vault_usdc.amount >= amount,
      AllocatorError::InsufficientBalance
    );

    // Verify the Drift program account matches the known program ID
    require!(
      ctx.accounts.drift_program.key() == DRIFT_PROGRAM_ID,
      AllocatorError::DriftCpiFailed
    );

    // Build Drift `deposit` instruction data (Borsh-serialized)
    // Args: market_index: u16, amount: u64, reduce_only: bool
    let mut data = Vec::with_capacity(8 + 2 + 8 + 1);
    data.extend_from_slice(&anchor_discriminator("deposit"));
    data.extend_from_slice(&0u16.to_le_bytes()); // market_index = 0 (USDC spot)
    data.extend_from_slice(&amount.to_le_bytes());
    data.push(0); // reduce_only = false

    // Account ordering matches Drift's Deposit context struct exactly:
    // 1. state (read-only)
    // 2. user (writable)
    // 3. user_stats (writable)
    // 4. authority (signer — our allocator PDA)
    // 5. spot_market_vault (writable)
    // 6. user_token_account (writable — our vault_usdc)
    // 7. token_program (read-only)
    let account_metas = vec![
      AccountMeta::new_readonly(ctx.accounts.drift_state.key(), false),
      AccountMeta::new(ctx.accounts.drift_user.key(), false),
      AccountMeta::new(ctx.accounts.drift_user_stats.key(), false),
      AccountMeta::new_readonly(ctx.accounts.allocator.key(), true), // PDA signer
      AccountMeta::new(ctx.accounts.drift_spot_market_vault.key(), false),
      AccountMeta::new(ctx.accounts.vault_usdc.key(), false),
      AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
    ];

    let ix = Instruction {
      program_id: DRIFT_PROGRAM_ID,
      accounts: account_metas,
      data,
    };

    let allocator_bump = allocator.bump;
    let signer_seeds: &[&[u8]] = &[b"allocator".as_ref(), &[allocator_bump]];

    invoke_signed(
      &ix,
      &[
        ctx.accounts.drift_state.to_account_info(),
        ctx.accounts.drift_user.to_account_info(),
        ctx.accounts.drift_user_stats.to_account_info(),
        ctx.accounts.allocator.to_account_info(),
        ctx.accounts.drift_spot_market_vault.to_account_info(),
        ctx.accounts.vault_usdc.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.drift_program.to_account_info(),
      ],
      &[signer_seeds],
    )
    .map_err(|_| AllocatorError::DriftCpiFailed)?;

    msg!("Allocated {} USDC to Drift", amount);
    Ok(())
  }

  // ─── 15. Recall from Drift (Real CPI) ───────────────────────────────

  pub fn recall_from_drift(ctx: Context<RecallFromDrift>, amount: u64) -> Result<()> {
    let allocator = &ctx.accounts.allocator;
    require!(!allocator.halted, AllocatorError::AllocatorHalted);
    require!(amount > 0, AllocatorError::InsufficientBalance);

    // Verify the Drift program account matches the known program ID
    require!(
      ctx.accounts.drift_program.key() == DRIFT_PROGRAM_ID,
      AllocatorError::DriftCpiFailed
    );

    // Build Drift `withdraw` instruction data (Borsh-serialized)
    // Args: market_index: u16, amount: u64, reduce_only: bool
    let mut data = Vec::with_capacity(8 + 2 + 8 + 1);
    data.extend_from_slice(&anchor_discriminator("withdraw"));
    data.extend_from_slice(&0u16.to_le_bytes()); // market_index = 0 (USDC spot)
    data.extend_from_slice(&amount.to_le_bytes());
    data.push(0); // reduce_only = false

    // Account ordering matches Drift's Withdraw context struct exactly:
    // 1. state (read-only)
    // 2. user (writable, has_one = authority)
    // 3. user_stats (writable, has_one = authority)
    // 4. authority (signer — our allocator PDA)
    // 5. spot_market_vault (writable)
    // 6. drift_signer (read-only — Drift's PDA that signs vault transfers)
    // 7. user_token_account (writable — our vault_usdc, receives withdrawn funds)
    // 8. token_program (read-only)
    let account_metas = vec![
      AccountMeta::new_readonly(ctx.accounts.drift_state.key(), false),
      AccountMeta::new(ctx.accounts.drift_user.key(), false),
      AccountMeta::new(ctx.accounts.drift_user_stats.key(), false),
      AccountMeta::new_readonly(ctx.accounts.allocator.key(), true), // PDA signer
      AccountMeta::new(ctx.accounts.drift_spot_market_vault.key(), false),
      AccountMeta::new_readonly(ctx.accounts.drift_signer.key(), false),
      AccountMeta::new(ctx.accounts.vault_usdc.key(), false),
      AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
    ];

    let ix = Instruction {
      program_id: DRIFT_PROGRAM_ID,
      accounts: account_metas,
      data,
    };

    let allocator_bump = allocator.bump;
    let signer_seeds: &[&[u8]] = &[b"allocator".as_ref(), &[allocator_bump]];

    invoke_signed(
      &ix,
      &[
        ctx.accounts.drift_state.to_account_info(),
        ctx.accounts.drift_user.to_account_info(),
        ctx.accounts.drift_user_stats.to_account_info(),
        ctx.accounts.allocator.to_account_info(),
        ctx.accounts.drift_spot_market_vault.to_account_info(),
        ctx.accounts.drift_signer.to_account_info(),
        ctx.accounts.vault_usdc.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.drift_program.to_account_info(),
      ],
      &[signer_seeds],
    )
    .map_err(|_| AllocatorError::DriftCpiFailed)?;

    msg!("Recalled {} USDC from Drift", amount);
    Ok(())
  }

  // ─── 16. Initialize Drift Account (One-Time Setup) ───────────────────

  /// Initializes a Drift User account and UserStats for the allocator PDA.
  /// This is a one-time setup instruction called by the admin after the
  /// allocator is initialized. The allocator PDA becomes the "authority"
  /// on the Drift User account, and the keeper is later set as delegate.
  ///
  /// Two CPIs are made:
  /// 1. `initialize_user_stats` — creates UserStats PDA for allocator
  /// 2. `initialize_user` — creates User PDA for allocator (sub_account 0)
  pub fn initialize_drift_account(
    ctx: Context<InitializeDriftAccount>,
    sub_account_id: u16,
  ) -> Result<()> {
    // Verify the Drift program account matches the known program ID
    require!(
      ctx.accounts.drift_program.key() == DRIFT_PROGRAM_ID,
      AllocatorError::DriftCpiFailed
    );

    let allocator_bump = ctx.accounts.allocator.bump;
    let signer_seeds: &[&[u8]] = &[b"allocator".as_ref(), &[allocator_bump]];

    // ── CPI 1: initialize_user_stats ──────────────────────────────────
    {
      let mut data = Vec::with_capacity(8);
      data.extend_from_slice(&anchor_discriminator("initialize_user_stats"));

      // Accounts for InitializeUserStats:
      // 1. user_stats (writable — PDA to be init'd)
      // 2. state (writable)
      // 3. authority (allocator PDA — not signer in Drift, but we pass it)
      // 4. payer (signer, writable — admin pays rent)
      // 5. rent sysvar
      // 6. system_program
      let account_metas = vec![
        AccountMeta::new(ctx.accounts.drift_user_stats.key(), false),
        AccountMeta::new(ctx.accounts.drift_state.key(), false),
        AccountMeta::new_readonly(ctx.accounts.allocator.key(), true),
        AccountMeta::new(ctx.accounts.admin.key(), true),
        AccountMeta::new_readonly(sysvar::rent::ID, false),
        AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
      ];

      let ix = Instruction {
        program_id: DRIFT_PROGRAM_ID,
        accounts: account_metas,
        data,
      };

      invoke_signed(
        &ix,
        &[
          ctx.accounts.drift_user_stats.to_account_info(),
          ctx.accounts.drift_state.to_account_info(),
          ctx.accounts.allocator.to_account_info(),
          ctx.accounts.admin.to_account_info(),
          ctx.accounts.rent.to_account_info(),
          ctx.accounts.system_program.to_account_info(),
          ctx.accounts.drift_program.to_account_info(),
        ],
        &[signer_seeds],
      )
      .map_err(|_| AllocatorError::DriftCpiFailed)?;
    }

    // ── CPI 2: initialize_user ────────────────────────────────────────
    {
      let mut data = Vec::with_capacity(8 + 2 + 32);
      data.extend_from_slice(&anchor_discriminator("initialize_user"));
      data.extend_from_slice(&sub_account_id.to_le_bytes());
      // name: [u8; 32] — "nanuqfi" padded with zeros
      let mut name = [0u8; 32];
      name[..7].copy_from_slice(b"nanuqfi");
      data.extend_from_slice(&name);

      // Accounts for InitializeUser:
      // 1. user (writable — PDA to be init'd)
      // 2. user_stats (writable, has_one = authority)
      // 3. state (writable)
      // 4. authority (allocator PDA)
      // 5. payer (signer, writable — admin pays rent)
      // 6. rent sysvar
      // 7. system_program
      let account_metas = vec![
        AccountMeta::new(ctx.accounts.drift_user.key(), false),
        AccountMeta::new(ctx.accounts.drift_user_stats.key(), false),
        AccountMeta::new(ctx.accounts.drift_state.key(), false),
        AccountMeta::new_readonly(ctx.accounts.allocator.key(), true),
        AccountMeta::new(ctx.accounts.admin.key(), true),
        AccountMeta::new_readonly(sysvar::rent::ID, false),
        AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
      ];

      let ix = Instruction {
        program_id: DRIFT_PROGRAM_ID,
        accounts: account_metas,
        data,
      };

      invoke_signed(
        &ix,
        &[
          ctx.accounts.drift_user.to_account_info(),
          ctx.accounts.drift_user_stats.to_account_info(),
          ctx.accounts.drift_state.to_account_info(),
          ctx.accounts.allocator.to_account_info(),
          ctx.accounts.admin.to_account_info(),
          ctx.accounts.rent.to_account_info(),
          ctx.accounts.system_program.to_account_info(),
          ctx.accounts.drift_program.to_account_info(),
        ],
        &[signer_seeds],
      )
      .map_err(|_| AllocatorError::DriftCpiFailed)?;
    }

    msg!(
      "Drift account initialized for allocator PDA (sub_account {})",
      sub_account_id
    );
    Ok(())
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Account Validation Structs
// ═══════════════════════════════════════════════════════════════════════════

#[derive(Accounts)]
pub struct InitializeAllocator<'info> {
  #[account(
    init,
    payer = admin,
    space = 8 + Allocator::INIT_SPACE,
    seeds = [b"allocator"],
    bump
  )]
  pub allocator: Account<'info, Allocator>,
  #[account(mut)]
  pub admin: Signer<'info>,
  /// CHECK: keeper authority pubkey, stored but not validated
  pub keeper_authority: UncheckedAccount<'info>,
  pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(risk_level: RiskLevel)]
pub struct InitializeRiskVault<'info> {
  #[account(
    init,
    payer = admin,
    space = 8 + RiskVault::INIT_SPACE,
    seeds = [b"vault".as_ref(), &[risk_level.as_u8()]],
    bump
  )]
  pub risk_vault: Account<'info, RiskVault>,
  #[account(
    seeds = [b"allocator"],
    bump = allocator.bump,
    has_one = admin @ AllocatorError::UnauthorizedAdmin,
  )]
  pub allocator: Account<'info, Allocator>,
  #[account(mut)]
  pub admin: Signer<'info>,
  /// CHECK: Drift vault address, stored for reference
  pub drift_vault: UncheckedAccount<'info>,
  /// Share token mint — must have allocator PDA as mint authority
  pub share_mint: Account<'info, Mint>,
  pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeTreasury<'info> {
  #[account(
    init,
    payer = admin,
    space = 8 + Treasury::INIT_SPACE,
    seeds = [b"treasury"],
    bump
  )]
  pub treasury: Account<'info, Treasury>,
  #[account(
    seeds = [b"allocator"],
    bump = allocator.bump,
    has_one = admin @ AllocatorError::UnauthorizedAdmin,
  )]
  pub allocator: Account<'info, Allocator>,
  #[account(mut)]
  pub admin: Signer<'info>,
  /// Treasury USDC token account (owned by allocator PDA)
  pub treasury_usdc: Account<'info, TokenAccount>,
  pub system_program: Program<'info, System>,
}

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

  /// User's USDC token account (source)
  #[account(mut)]
  pub user_usdc: Account<'info, TokenAccount>,

  /// User's share token account (destination for minted shares)
  #[account(mut)]
  pub user_shares: Account<'info, TokenAccount>,

  /// Vault's USDC token account (destination for deposit)
  #[account(mut)]
  pub vault_usdc: Account<'info, TokenAccount>,

  #[account(mut)]
  pub user: Signer<'info>,

  pub token_program: Program<'info, Token>,
  pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RequestWithdraw<'info> {
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
    seeds = [b"position", user.key().as_ref(), risk_vault.key().as_ref()],
    bump = user_position.bump,
    constraint = user_position.user == user.key(),
  )]
  pub user_position: Account<'info, UserPosition>,

  pub user: Signer<'info>,
}

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

  /// User's share token account (shares to burn)
  #[account(mut)]
  pub user_shares: Account<'info, TokenAccount>,

  /// User's USDC token account (receives withdrawal)
  #[account(mut)]
  pub user_usdc: Account<'info, TokenAccount>,

  /// Vault's USDC token account (source for withdrawal)
  #[account(mut)]
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

#[derive(Accounts)]
pub struct Rebalance<'info> {
  #[account(
    mut,
    seeds = [b"allocator"],
    bump = allocator.bump,
    has_one = keeper_authority @ AllocatorError::UnauthorizedKeeper,
  )]
  pub allocator: Account<'info, Allocator>,

  #[account(
    mut,
    constraint = risk_vault.allocator == allocator.key(),
  )]
  pub risk_vault: Account<'info, RiskVault>,

  #[account(
    init,
    payer = keeper_authority,
    space = 8 + RebalanceRecord::INIT_SPACE,
    seeds = [
      b"rebalance",
      risk_vault.key().as_ref(),
      &risk_vault.rebalance_counter.to_le_bytes(),
    ],
    bump
  )]
  pub rebalance_record: Account<'info, RebalanceRecord>,

  #[account(
    mut,
    seeds = [b"treasury"],
    bump = treasury.bump,
  )]
  pub treasury: Account<'info, Treasury>,

  /// Vault's USDC token account (fee source)
  #[account(mut)]
  pub vault_usdc: Account<'info, TokenAccount>,

  /// Treasury USDC token account (fee destination)
  #[account(
    mut,
    constraint = treasury_usdc.key() == treasury.usdc_token_account,
  )]
  pub treasury_usdc: Account<'info, TokenAccount>,

  #[account(mut)]
  pub keeper_authority: Signer<'info>,

  pub token_program: Program<'info, Token>,
  pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EmergencyHalt<'info> {
  #[account(
    mut,
    seeds = [b"allocator"],
    bump = allocator.bump,
    has_one = admin @ AllocatorError::UnauthorizedAdmin,
  )]
  pub allocator: Account<'info, Allocator>,

  pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct Resume<'info> {
  #[account(
    mut,
    seeds = [b"allocator"],
    bump = allocator.bump,
    has_one = admin @ AllocatorError::UnauthorizedAdmin,
  )]
  pub allocator: Account<'info, Allocator>,

  pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateKeeperAuthority<'info> {
  #[account(
    mut,
    seeds = [b"allocator"],
    bump = allocator.bump,
    has_one = admin @ AllocatorError::UnauthorizedAdmin,
  )]
  pub allocator: Account<'info, Allocator>,

  pub admin: Signer<'info>,

  /// CHECK: New keeper authority pubkey
  pub new_keeper_authority: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct UpdateGuardrails<'info> {
  #[account(
    seeds = [b"allocator"],
    bump = allocator.bump,
    has_one = admin @ AllocatorError::UnauthorizedAdmin,
  )]
  pub allocator: Account<'info, Allocator>,

  #[account(
    mut,
    constraint = risk_vault.allocator == allocator.key(),
  )]
  pub risk_vault: Account<'info, RiskVault>,

  pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct AcquireLease<'info> {
  #[account(
    seeds = [b"allocator"],
    bump = allocator.bump,
    has_one = keeper_authority @ AllocatorError::UnauthorizedKeeper,
  )]
  pub allocator: Account<'info, Allocator>,

  #[account(
    init_if_needed,
    payer = keeper_authority,
    space = 8 + KeeperLease::INIT_SPACE,
    seeds = [b"lease", risk_vault.key().as_ref()],
    bump
  )]
  pub keeper_lease: Account<'info, KeeperLease>,

  #[account(
    constraint = risk_vault.allocator == allocator.key(),
  )]
  pub risk_vault: Account<'info, RiskVault>,

  /// CHECK: Validated via has_one on allocator
  #[account(mut)]
  pub keeper_authority: Signer<'info>,

  pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Heartbeat<'info> {
  #[account(
    seeds = [b"allocator"],
    bump = allocator.bump,
    has_one = keeper_authority @ AllocatorError::UnauthorizedKeeper,
  )]
  pub allocator: Account<'info, Allocator>,

  #[account(
    mut,
    seeds = [b"lease", risk_vault.key().as_ref()],
    bump = keeper_lease.bump,
    constraint = keeper_lease.keeper == keeper_authority.key() @ AllocatorError::UnauthorizedKeeper,
  )]
  pub keeper_lease: Account<'info, KeeperLease>,

  #[account(
    constraint = risk_vault.allocator == allocator.key(),
  )]
  pub risk_vault: Account<'info, RiskVault>,

  pub keeper_authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct WithdrawTreasury<'info> {
  #[account(
    seeds = [b"allocator"],
    bump = allocator.bump,
    has_one = admin @ AllocatorError::UnauthorizedAdmin,
  )]
  pub allocator: Account<'info, Allocator>,

  #[account(
    mut,
    seeds = [b"treasury"],
    bump = treasury.bump,
    constraint = treasury.allocator == allocator.key(),
  )]
  pub treasury: Account<'info, Treasury>,

  /// Treasury USDC token account (source)
  #[account(
    mut,
    constraint = treasury_usdc.key() == treasury.usdc_token_account,
  )]
  pub treasury_usdc: Account<'info, TokenAccount>,

  /// Admin's USDC token account (destination)
  #[account(mut)]
  pub admin_usdc: Account<'info, TokenAccount>,

  pub admin: Signer<'info>,
  pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateDepositCap<'info> {
  #[account(seeds = [b"allocator"], bump = allocator.bump)]
  pub allocator: Account<'info, Allocator>,
  #[account(
    mut,
    constraint = risk_vault.allocator == allocator.key(),
  )]
  pub risk_vault: Account<'info, RiskVault>,
  #[account(constraint = admin.key() == allocator.admin @ AllocatorError::UnauthorizedAdmin)]
  pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct AllocateToDrift<'info> {
  #[account(mut, seeds = [b"allocator"], bump = allocator.bump)]
  pub allocator: Account<'info, Allocator>,
  #[account(mut, constraint = risk_vault.allocator == allocator.key())]
  pub risk_vault: Account<'info, RiskVault>,
  #[account(constraint = keeper.key() == allocator.keeper_authority @ AllocatorError::UnauthorizedKeeper)]
  pub keeper: Signer<'info>,
  /// Vault's USDC token account (source — funds flow to Drift)
  #[account(mut)]
  pub vault_usdc: Account<'info, TokenAccount>,
  /// CHECK: Drift State account, validated by Drift program during CPI
  pub drift_state: UncheckedAccount<'info>,
  /// CHECK: Drift User account owned by allocator PDA, validated by Drift
  #[account(mut)]
  pub drift_user: UncheckedAccount<'info>,
  /// CHECK: Drift UserStats account for allocator PDA, validated by Drift
  #[account(mut)]
  pub drift_user_stats: UncheckedAccount<'info>,
  /// CHECK: Drift's USDC spot market vault (destination), validated by Drift
  #[account(mut)]
  pub drift_spot_market_vault: UncheckedAccount<'info>,
  /// CHECK: Drift program — verified against DRIFT_PROGRAM_ID constant
  pub drift_program: UncheckedAccount<'info>,
  pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RecallFromDrift<'info> {
  #[account(mut, seeds = [b"allocator"], bump = allocator.bump)]
  pub allocator: Account<'info, Allocator>,
  #[account(mut, constraint = risk_vault.allocator == allocator.key())]
  pub risk_vault: Account<'info, RiskVault>,
  #[account(constraint = keeper.key() == allocator.keeper_authority @ AllocatorError::UnauthorizedKeeper)]
  pub keeper: Signer<'info>,
  /// Vault's USDC token account (destination — receives recalled funds)
  #[account(mut)]
  pub vault_usdc: Account<'info, TokenAccount>,
  /// CHECK: Drift State account, validated by Drift program during CPI
  pub drift_state: UncheckedAccount<'info>,
  /// CHECK: Drift User account owned by allocator PDA, validated by Drift
  #[account(mut)]
  pub drift_user: UncheckedAccount<'info>,
  /// CHECK: Drift UserStats account for allocator PDA, validated by Drift
  #[account(mut)]
  pub drift_user_stats: UncheckedAccount<'info>,
  /// CHECK: Drift's USDC spot market vault (source for withdrawal)
  #[account(mut)]
  pub drift_spot_market_vault: UncheckedAccount<'info>,
  /// CHECK: Drift's signer PDA — signs vault token transfers.
  /// Derived as PDA(["drift_signer"], DRIFT_PROGRAM_ID).
  pub drift_signer: UncheckedAccount<'info>,
  /// CHECK: Drift program — verified against DRIFT_PROGRAM_ID constant
  pub drift_program: UncheckedAccount<'info>,
  pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct InitializeDriftAccount<'info> {
  #[account(
    seeds = [b"allocator"],
    bump = allocator.bump,
    has_one = admin @ AllocatorError::UnauthorizedAdmin,
  )]
  pub allocator: Account<'info, Allocator>,
  #[account(mut)]
  pub admin: Signer<'info>,
  /// CHECK: Drift State account, validated by Drift during CPI
  #[account(mut)]
  pub drift_state: UncheckedAccount<'info>,
  /// CHECK: Drift User PDA to be initialized.
  /// Derived as PDA(["user", allocator_pda, sub_account_id], DRIFT_PROGRAM_ID)
  #[account(mut)]
  pub drift_user: UncheckedAccount<'info>,
  /// CHECK: Drift UserStats PDA to be initialized.
  /// Derived as PDA(["user_stats", allocator_pda], DRIFT_PROGRAM_ID)
  #[account(mut)]
  pub drift_user_stats: UncheckedAccount<'info>,
  /// CHECK: Drift program — verified against DRIFT_PROGRAM_ID constant
  pub drift_program: UncheckedAccount<'info>,
  pub rent: Sysvar<'info, Rent>,
  pub system_program: Program<'info, System>,
}
