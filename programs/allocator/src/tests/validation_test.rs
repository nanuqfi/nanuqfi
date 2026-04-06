#[cfg(test)]
mod tests {
  use anchor_lang::error::Error;
  use anchor_lang::prelude::Pubkey;

  use crate::errors::AllocatorError;
  use crate::validation::{
    validate_deposit, validate_max_weight, validate_perp_weight, validate_rebalance_interval,
    validate_weight_shift, validate_weight_sum, MAX_PROTOCOLS, MIN_FIRST_DEPOSIT,
    MIN_REBALANCE_INTERVAL_SLOTS,
  };
  // whitelist helpers are pub in validation but also re-exported via lib's `use validation::*`
  use crate::{
    validate_protocol_whitelisted, validate_whitelist_add, validate_whitelist_remove,
  };

  /// Match an Anchor error by its numeric code (6000 + variant offset).
  fn is_error(result: &Result<(), Error>, expected: AllocatorError) -> bool {
    match result {
      Err(e) => e.to_string().contains(&(expected as u32 + 6000).to_string()),
      Ok(()) => false,
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // validate_weight_sum
  // ────────────────────────────────────────────────────────────────────────────

  #[test]
  fn weight_sum_valid_exact_10000() {
    assert!(validate_weight_sum(&[5000, 5000]).is_ok());
  }

  #[test]
  fn weight_sum_valid_single_entry() {
    assert!(validate_weight_sum(&[10000]).is_ok());
  }

  #[test]
  fn weight_sum_rejects_9999() {
    let r = validate_weight_sum(&[5000, 4999]);
    assert!(is_error(&r, AllocatorError::InvalidWeightSum));
  }

  #[test]
  fn weight_sum_rejects_10001() {
    let r = validate_weight_sum(&[5000, 5001]);
    assert!(is_error(&r, AllocatorError::InvalidWeightSum));
  }

  #[test]
  fn weight_sum_rejects_empty() {
    // sum of empty slice = 0, not 10_000
    let r = validate_weight_sum(&[]);
    assert!(is_error(&r, AllocatorError::InvalidWeightSum));
  }

  #[test]
  fn weight_sum_eight_equal_weights() {
    // 8 × 1250 = 10000
    let weights = [1250u16; 8];
    assert!(validate_weight_sum(&weights).is_ok());
  }

  // ────────────────────────────────────────────────────────────────────────────
  // validate_max_weight
  // ────────────────────────────────────────────────────────────────────────────

  #[test]
  fn max_weight_within_limit() {
    assert!(validate_max_weight(&[3000, 3000, 4000], 5000).is_ok());
  }

  #[test]
  fn max_weight_at_exact_limit() {
    assert!(validate_max_weight(&[5000, 5000], 5000).is_ok());
  }

  #[test]
  fn max_weight_exceeds_limit() {
    let r = validate_max_weight(&[5001, 4999], 5000);
    assert!(is_error(&r, AllocatorError::WeightExceedsMax));
  }

  #[test]
  fn max_weight_single_weight_at_10000_with_limit_10000() {
    assert!(validate_max_weight(&[10000], 10000).is_ok());
  }

  // ────────────────────────────────────────────────────────────────────────────
  // validate_perp_weight
  // ────────────────────────────────────────────────────────────────────────────

  #[test]
  fn perp_weight_within_limit() {
    assert!(validate_perp_weight(&[2000, 8000], 3000).is_ok());
  }

  #[test]
  fn perp_weight_at_exact_limit() {
    assert!(validate_perp_weight(&[3000, 7000], 3000).is_ok());
  }

  #[test]
  fn perp_weight_exceeds_limit() {
    let r = validate_perp_weight(&[3001, 6999], 3000);
    assert!(is_error(&r, AllocatorError::WeightExceedsMax));
  }

  #[test]
  fn perp_weight_empty_weights_is_ok() {
    // No first element → no check → always Ok
    assert!(validate_perp_weight(&[], 3000).is_ok());
  }

  // ────────────────────────────────────────────────────────────────────────────
  // validate_weight_shift
  // ────────────────────────────────────────────────────────────────────────────

  #[test]
  fn weight_shift_within_limit() {
    let old = [5000u16, 5000];
    let new = [6000u16, 4000]; // shift = 1000 < 2000
    assert!(validate_weight_shift(&old, &new, 2000).is_ok());
  }

  #[test]
  fn weight_shift_at_exact_limit() {
    let old = [5000u16, 5000];
    let new = [7000u16, 3000]; // shift = 2000, limit = 2000
    assert!(validate_weight_shift(&old, &new, 2000).is_ok());
  }

  #[test]
  fn weight_shift_exceeds_limit() {
    let old = [5000u16, 5000];
    let new = [7001u16, 2999]; // shift = 2001 > 2000
    let r = validate_weight_shift(&old, &new, 2000);
    assert!(is_error(&r, AllocatorError::ShiftTooLarge));
  }

  #[test]
  fn weight_shift_first_rebalance_empty_old_skips_check() {
    // Even a huge new weight is allowed when old is empty (first rebalance)
    let new = [10000u16];
    assert!(validate_weight_shift(&[], &new, 0).is_ok());
  }

  // ────────────────────────────────────────────────────────────────────────────
  // validate_deposit
  // ────────────────────────────────────────────────────────────────────────────

  #[test]
  fn deposit_valid_subsequent_deposit() {
    // Non-first deposit, no cap, no tx limit
    assert!(validate_deposit(500_000, 0, 0, 0, false).is_ok());
  }

  #[test]
  fn deposit_zero_amount_rejected() {
    let r = validate_deposit(0, 0, 0, 0, false);
    assert!(is_error(&r, AllocatorError::DepositTooSmall));
  }

  #[test]
  fn deposit_first_deposit_below_min_rejected() {
    // Below MIN_FIRST_DEPOSIT (1_000_000 = 1 USDC)
    let r = validate_deposit(MIN_FIRST_DEPOSIT - 1, 0, 0, 0, true);
    assert!(is_error(&r, AllocatorError::DepositTooSmall));
  }

  #[test]
  fn deposit_first_deposit_at_minimum() {
    assert!(validate_deposit(MIN_FIRST_DEPOSIT, 0, 0, 0, true).is_ok());
  }

  #[test]
  fn deposit_exceeds_cap() {
    // current_assets=900_000, amount=200_000, cap=1_000_000 → total=1_100_000 > cap
    let r = validate_deposit(200_000, 1_000_000, 900_000, 0, false);
    assert!(is_error(&r, AllocatorError::DepositCapExceeded));
  }

  #[test]
  fn deposit_at_cap_boundary() {
    // current_assets=900_000, amount=100_000, cap=1_000_000 → exactly at cap
    assert!(validate_deposit(100_000, 1_000_000, 900_000, 0, false).is_ok());
  }

  #[test]
  fn deposit_uncapped_zero_deposit_cap_allows_any_amount() {
    // deposit_cap=0 means uncapped
    assert!(validate_deposit(100_000_000, 0, 999_999_999, 0, false).is_ok());
  }

  #[test]
  fn deposit_exceeds_per_tx_limit() {
    let r = validate_deposit(2_000_000, 0, 0, 1_000_000, false);
    assert!(is_error(&r, AllocatorError::DepositExceedsTxLimit));
  }

  #[test]
  fn deposit_per_tx_zero_means_unlimited() {
    // max_single=0 → no per-tx cap, any amount is fine
    assert!(validate_deposit(999_999_999, 0, 0, 0, false).is_ok());
  }

  #[test]
  fn deposit_first_deposit_above_min_with_caps() {
    // First deposit of exactly 2 USDC, cap=10 USDC, no current assets, tx limit=5 USDC
    assert!(validate_deposit(2_000_000, 10_000_000, 0, 5_000_000, true).is_ok());
  }

  // ────────────────────────────────────────────────────────────────────────────
  // validate_rebalance_interval
  // ────────────────────────────────────────────────────────────────────────────

  #[test]
  fn rebalance_interval_sufficient() {
    let r = validate_rebalance_interval(
      MIN_REBALANCE_INTERVAL_SLOTS + 1,
      0,
    );
    assert!(r.is_ok());
  }

  #[test]
  fn rebalance_interval_too_soon() {
    let r = validate_rebalance_interval(
      MIN_REBALANCE_INTERVAL_SLOTS - 1,
      0,
    );
    assert!(is_error(&r, AllocatorError::RebalanceTooSoon));
  }

  #[test]
  fn rebalance_interval_at_exact_minimum() {
    let r = validate_rebalance_interval(MIN_REBALANCE_INTERVAL_SLOTS, 0);
    assert!(r.is_ok());
  }

  #[test]
  fn rebalance_interval_with_non_zero_last_slot() {
    let last = 50_000u64;
    let current = last + MIN_REBALANCE_INTERVAL_SLOTS;
    assert!(validate_rebalance_interval(current, last).is_ok());
  }

  #[test]
  fn rebalance_interval_saturating_sub_prevents_underflow() {
    // current < last → saturating_sub = 0 → too soon
    let r = validate_rebalance_interval(100, 200);
    assert!(is_error(&r, AllocatorError::RebalanceTooSoon));
  }

  // ────────────────────────────────────────────────────────────────────────────
  // validate_whitelist_add
  // ────────────────────────────────────────────────────────────────────────────

  #[test]
  fn whitelist_add_succeeds_on_empty_list() {
    let protocol = Pubkey::new_unique();
    assert!(validate_whitelist_add(&[], &protocol).is_ok());
  }

  #[test]
  fn whitelist_add_rejects_duplicate() {
    let protocol = Pubkey::new_unique();
    let list = vec![protocol];
    let r = validate_whitelist_add(&list, &protocol);
    assert!(is_error(&r, AllocatorError::AlreadyWhitelisted));
  }

  #[test]
  fn whitelist_add_rejects_when_full() {
    // Fill to MAX_PROTOCOLS capacity
    let protocols: Vec<Pubkey> = (0..MAX_PROTOCOLS).map(|_| Pubkey::new_unique()).collect();
    let new_protocol = Pubkey::new_unique();
    let r = validate_whitelist_add(&protocols, &new_protocol);
    assert!(is_error(&r, AllocatorError::WhitelistFull));
  }

  #[test]
  fn whitelist_add_succeeds_when_one_below_max() {
    let protocols: Vec<Pubkey> = (0..MAX_PROTOCOLS - 1).map(|_| Pubkey::new_unique()).collect();
    let new_protocol = Pubkey::new_unique();
    assert!(validate_whitelist_add(&protocols, &new_protocol).is_ok());
  }

  // ────────────────────────────────────────────────────────────────────────────
  // validate_whitelist_remove
  // ────────────────────────────────────────────────────────────────────────────

  #[test]
  fn whitelist_remove_succeeds_when_present() {
    let protocol = Pubkey::new_unique();
    let list = vec![protocol];
    assert!(validate_whitelist_remove(&list, &protocol).is_ok());
  }

  #[test]
  fn whitelist_remove_rejects_when_not_found() {
    let protocol = Pubkey::new_unique();
    let other = Pubkey::new_unique();
    let list = vec![other];
    let r = validate_whitelist_remove(&list, &protocol);
    assert!(is_error(&r, AllocatorError::ProtocolNotWhitelisted));
  }

  #[test]
  fn whitelist_remove_rejects_on_empty_list() {
    let protocol = Pubkey::new_unique();
    let r = validate_whitelist_remove(&[], &protocol);
    assert!(is_error(&r, AllocatorError::ProtocolNotWhitelisted));
  }

  // ────────────────────────────────────────────────────────────────────────────
  // validate_protocol_whitelisted
  // ────────────────────────────────────────────────────────────────────────────

  #[test]
  fn protocol_whitelisted_empty_list_is_permissionless() {
    let protocol = Pubkey::new_unique();
    assert!(validate_protocol_whitelisted(&[], &protocol).is_ok());
  }

  #[test]
  fn protocol_whitelisted_listed_protocol_passes() {
    let protocol = Pubkey::new_unique();
    let list = vec![protocol];
    assert!(validate_protocol_whitelisted(&list, &protocol).is_ok());
  }

  #[test]
  fn protocol_whitelisted_unlisted_protocol_rejected() {
    let listed = Pubkey::new_unique();
    let unlisted = Pubkey::new_unique();
    let list = vec![listed];
    let r = validate_protocol_whitelisted(&list, &unlisted);
    assert!(is_error(&r, AllocatorError::ProtocolNotWhitelisted));
  }

  #[test]
  fn protocol_whitelisted_one_of_many_passes() {
    let target = Pubkey::new_unique();
    let others: Vec<Pubkey> = (0..4).map(|_| Pubkey::new_unique()).collect();
    let mut list = others;
    list.push(target);
    assert!(validate_protocol_whitelisted(&list, &target).is_ok());
  }
}
