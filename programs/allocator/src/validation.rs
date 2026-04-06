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
// MAX_PROTOCOLS is defined in state.rs — reuse it there to avoid ambiguity
pub use crate::state::MAX_PROTOCOLS;

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
