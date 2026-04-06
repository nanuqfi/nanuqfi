use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};

pub mod errors;
pub mod state;

use errors::AllocatorError;
use state::*;

declare_id!("2QtJ5kmxLuW2jYCFpJMtzZ7PCnKdoMwkeueYoDUi5z5P");

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

/// Virtual offset for share price — prevents inflation/griefing attack.
/// 1 USDC = 1_000_000 base units (6 decimals).
const VIRTUAL_OFFSET: u64 = 1_000_000;

/// Minimum first deposit to prevent dust attacks.
const MIN_FIRST_DEPOSIT: u64 = 1_000_000; // 1 USDC

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
    allocator.version = CURRENT_VERSION;
    allocator.admin = ctx.accounts.admin.key();
    allocator.keeper_authority = ctx.accounts.keeper_authority.key();
    allocator.total_tvl = 0;
    allocator.halted = false;
    allocator.protocol_whitelist = vec![];
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
    vault.version = CURRENT_VERSION;
    vault.allocator = ctx.accounts.allocator.key();
    vault.risk_level = risk_level;
    vault.protocol_vault = ctx.accounts.protocol_vault.key();
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
    vault.max_single_deposit = 0; // 0 = uncapped
    vault.bump = ctx.bumps.risk_vault;
    Ok(())
  }

  // ─── 1. Initialize Treasury ───────────────────────────────────────────

  pub fn initialize_treasury(ctx: Context<InitializeTreasury>) -> Result<()> {
    let treasury = &mut ctx.accounts.treasury;
    treasury.version = CURRENT_VERSION;
    treasury.allocator = ctx.accounts.allocator.key();
    treasury.usdc_token_account = ctx.accounts.treasury_usdc.key();
    treasury.total_fees_collected = 0;
    treasury.total_fees_withdrawn = 0;
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

    // Per-transaction deposit limit (0 = uncapped)
    let max_single = ctx.accounts.risk_vault.max_single_deposit;
    if max_single > 0 {
      require!(amount <= max_single, AllocatorError::DepositExceedsTxLimit);
    }

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
      position.version = CURRENT_VERSION;
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

    // Update HWM price: current share price after deposit (with virtual offset)
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

    // Calculate and store request-time share price (with virtual offset)
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

    // Current share price (with virtual offset)
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
      .checked_sub(gross_usdc)
      .ok_or(AllocatorError::ArithmeticUnderflow)?;

    // Update position
    position.shares = position
      .shares
      .checked_sub(shares)
      .ok_or(AllocatorError::MathOverflow)?;
    position.pending_withdrawal_shares = 0;
    position.withdraw_request_slot = 0;
    position.request_time_share_price = 0;

    // Update HWM to current price if still has shares (with virtual offset)
    if position.shares > 0 && vault.total_shares > 0 {
      let new_price = vault
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
            .checked_sub(transfer_fee)
            .ok_or(AllocatorError::ArithmeticUnderflow)?;

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
      || clock.slot.checked_sub(vault.last_rebalance_slot).unwrap_or(0) >= EQUITY_SNAPSHOT_INTERVAL
    {
      vault.equity_24h_ago = equity_snapshot;
    }

    // 12. Record RebalanceRecord
    let record = &mut ctx.accounts.rebalance_record;
    record.version = CURRENT_VERSION;
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

    lease.version = CURRENT_VERSION;
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

    // Check available fees (collected minus already withdrawn)
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

    // Increment withdrawn counter (total_fees_collected stays cumulative)
    let treasury = &mut ctx.accounts.treasury;
    treasury.total_fees_withdrawn = treasury
      .total_fees_withdrawn
      .checked_add(amount)
      .ok_or(AllocatorError::ArithmeticOverflow)?;

    msg!("Treasury withdrawal: {} USDC", amount);
    Ok(())
  }

  // ─── 13. Update Deposit Cap ─────────────────────────────────────────

  pub fn update_deposit_cap(ctx: Context<UpdateDepositCap>, new_cap: u64) -> Result<()> {
    let vault = &mut ctx.accounts.risk_vault;
    vault.deposit_cap = new_cap;
    Ok(())
  }

  pub fn update_treasury_usdc(ctx: Context<UpdateTreasuryUsdc>) -> Result<()> {
    let treasury = &mut ctx.accounts.treasury;
    treasury.usdc_token_account = ctx.accounts.new_treasury_usdc.key();
    Ok(())
  }

  /// Admin-only: reset vault accounting to clean state (devnet testing utility).
  /// Zeroes shares, assets, peak equity, timing. Preserves rebalance_counter
  /// (on-chain RebalanceRecord PDAs are keyed by counter, so resetting would collide).
  pub fn admin_reset_vault(ctx: Context<AdminResetVault>) -> Result<()> {
    let vault = &mut ctx.accounts.risk_vault;
    let clock = Clock::get()?;
    vault.total_shares = 0;
    vault.total_assets = 0;
    vault.peak_equity = 0;
    vault.current_equity = 0;
    vault.equity_24h_ago = 0;
    vault.last_rebalance_slot = 0;
    // NOTE: rebalance_counter is NOT reset — existing RebalanceRecord PDAs would collide
    vault.last_mgmt_fee_slot = clock.slot;
    vault.current_weights = vec![];
    Ok(())
  }

  /// Admin-only: set allocator total_tvl to match actual vault totals.
  pub fn admin_set_tvl(ctx: Context<AdminSetTvl>, tvl: u64) -> Result<()> {
    ctx.accounts.allocator.total_tvl = tvl;
    Ok(())
  }

  /// Admin-only: override redemption period with minimum safety bound.
  pub fn admin_set_redemption_period(ctx: Context<AdminResetVault>, slots: u64) -> Result<()> {
    const MIN_REDEMPTION_SLOTS: u64 = 100; // ~40 seconds minimum
    require!(slots >= MIN_REDEMPTION_SLOTS, AllocatorError::RedemptionPeriodTooShort);
    ctx.accounts.risk_vault.redemption_period_slots = slots;
    msg!("Redemption period set to {} slots", slots);
    Ok(())
  }

  /// Admin-only: set rebalance counter to skip past existing RebalanceRecord PDAs.
  pub fn admin_set_rebalance_counter(ctx: Context<AdminResetVault>, counter: u32) -> Result<()> {
    ctx.accounts.risk_vault.rebalance_counter = counter;
    Ok(())
  }

  /// Admin-only: set per-transaction deposit limit (0 = uncapped).
  pub fn admin_set_max_single_deposit(ctx: Context<AdminResetVault>, limit: u64) -> Result<()> {
    ctx.accounts.risk_vault.max_single_deposit = limit;
    msg!("Max single deposit set to {}", limit);
    Ok(())
  }

  // ─── Protocol Whitelist Management ──────────────────────────────────

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

  // ─── Generic Protocol Allocation ────────────────────────────────────

  /// Transfer USDC from vault to a protocol's token account.
  /// The keeper calls this after the scoring engine proposes allocations.
  pub fn allocate_to_protocol(ctx: Context<AllocateToProtocol>, amount: u64) -> Result<()> {
    require!(!ctx.accounts.allocator.halted, AllocatorError::AllocatorHalted);

    // Validate protocol is whitelisted (skip if whitelist empty — backwards compat during init)
    if !ctx.accounts.allocator.protocol_whitelist.is_empty() {
      require!(
        ctx.accounts.allocator.protocol_whitelist.contains(&ctx.accounts.protocol_usdc.owner),
        AllocatorError::ProtocolNotWhitelisted
      );
    }

    require!(amount > 0, AllocatorError::InsufficientBalance);
    require!(
      ctx.accounts.vault_usdc.amount >= amount,
      AllocatorError::InsufficientBalance
    );

    let allocator_bump = ctx.accounts.allocator.bump;
    let seeds: &[&[u8]] = &[b"allocator", &[allocator_bump]];
    let signer_seeds = &[seeds];

    token::transfer(
      CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
          from: ctx.accounts.vault_usdc.to_account_info(),
          to: ctx.accounts.protocol_usdc.to_account_info(),
          authority: ctx.accounts.allocator.to_account_info(),
        },
        signer_seeds,
      ),
      amount,
    )?;

    msg!("Allocated {} USDC to protocol", amount);
    Ok(())
  }

  /// Transfer USDC back from a protocol's token account to the vault.
  pub fn recall_from_protocol(ctx: Context<RecallFromProtocol>, amount: u64) -> Result<()> {
    require!(!ctx.accounts.allocator.halted, AllocatorError::AllocatorHalted);
    require!(amount > 0, AllocatorError::InsufficientBalance);

    let allocator_bump = ctx.accounts.allocator.bump;
    let seeds: &[&[u8]] = &[b"allocator", &[allocator_bump]];
    let signer_seeds = &[seeds];

    token::transfer(
      CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
          from: ctx.accounts.protocol_usdc.to_account_info(),
          to: ctx.accounts.vault_usdc.to_account_info(),
          authority: ctx.accounts.allocator.to_account_info(),
        },
        signer_seeds,
      ),
      amount,
    )?;

    msg!("Recalled {} USDC from protocol", amount);
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
  /// CHECK: Protocol vault address, stored for reference
  pub protocol_vault: UncheckedAccount<'info>,
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

  /// USDC mint (for vault_usdc constraint validation)
  pub usdc_mint: Account<'info, Mint>,

  /// Vault's USDC token account (fee source) — constrained
  #[account(
    mut,
    token::mint = usdc_mint,
    token::authority = allocator,
  )]
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
pub struct AdminSetTvl<'info> {
  #[account(mut, seeds = [b"allocator"], bump = allocator.bump)]
  pub allocator: Account<'info, Allocator>,
  #[account(constraint = admin.key() == allocator.admin @ AllocatorError::UnauthorizedAdmin)]
  pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateTreasuryUsdc<'info> {
  #[account(seeds = [b"allocator"], bump = allocator.bump)]
  pub allocator: Account<'info, Allocator>,
  #[account(
    mut,
    seeds = [b"treasury"],
    bump = treasury.bump,
    constraint = treasury.allocator == allocator.key(),
  )]
  pub treasury: Account<'info, Treasury>,
  pub new_treasury_usdc: Account<'info, TokenAccount>,
  #[account(constraint = admin.key() == allocator.admin @ AllocatorError::UnauthorizedAdmin)]
  pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct AdminResetVault<'info> {
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
  /// Vault's USDC token account (source) — constrained
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
  /// Vault's USDC token account (destination) — constrained
  #[account(
    mut,
    token::mint = usdc_mint,
    token::authority = allocator,
  )]
  pub vault_usdc: Account<'info, TokenAccount>,
  pub token_program: Program<'info, Token>,
}
