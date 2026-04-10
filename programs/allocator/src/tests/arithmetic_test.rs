#[cfg(test)]
mod tests {
  use crate::validation::{
    SHARE_PRICE_PRECISION,
    calculate_management_fee, calculate_performance_fee, calculate_share_price,
    calculate_shares_to_mint, check_drawdown_exceeded, check_oracle_divergence, should_auto_halt,
  };

  // ──────────────────────────────────────────────────────────────────────────────
  // calculate_share_price  (returns Result<u64>)
  // ──────────────────────────────────────────────────────────────────────────────

  #[test]
  fn share_price_empty_vault_returns_precision() {
    // Both zero → first-deposit sentinel: 1:1 ratio
    assert_eq!(calculate_share_price(0, 0).unwrap(), SHARE_PRICE_PRECISION);
  }

  #[test]
  fn share_price_zero_assets_returns_precision() {
    // assets=0 is treated the same as empty vault
    assert_eq!(calculate_share_price(0, 1_000_000).unwrap(), SHARE_PRICE_PRECISION);
  }

  #[test]
  fn share_price_zero_shares_returns_precision() {
    // shares=0 is treated the same as empty vault
    assert_eq!(calculate_share_price(1_000_000, 0).unwrap(), SHARE_PRICE_PRECISION);
  }

  #[test]
  fn share_price_equal_assets_and_shares_returns_precision() {
    // With virtual offset: (1M + 1M) * 1M / (1M + 1M) = 1M exactly
    assert_eq!(
      calculate_share_price(1_000_000, 1_000_000).unwrap(),
      SHARE_PRICE_PRECISION
    );
  }

  #[test]
  fn share_price_double_assets_returns_one_and_half() {
    // assets=2M, shares=1M → (2M + 1M) * 1M / (1M + 1M) = 3M * 1M / 2M = 1_500_000
    assert_eq!(calculate_share_price(2_000_000, 1_000_000).unwrap(), 1_500_000);
  }

  #[test]
  fn share_price_large_values_no_overflow() {
    // 10 billion USDC in both assets and shares → should still equal SHARE_PRICE_PRECISION
    // (assets + VIRTUAL_OFFSET) * PRECISION / (shares + VIRTUAL_OFFSET)
    // ≈ (10^13 + 10^6) * 10^6 / (10^13 + 10^6) = 10^6 exactly
    let large = 10_000_000_000_000u64; // ~10B USDC at 6 decimals
    assert_eq!(calculate_share_price(large, large).unwrap(), SHARE_PRICE_PRECISION);
  }

  #[test]
  fn share_price_virtual_offset_dampens_inflation_attack() {
    // If an attacker donates 1 USDC to an otherwise empty vault (1 share minted),
    // the virtual offset means price is (1M + 1M) * 1M / (1 + 1M) ≈ 2M * 1M / 1_000_001 ≈ 1_999_998
    // instead of the unbounded ratio without virtual offset.
    let price = calculate_share_price(1_000_000, 1).unwrap();
    // Price should be high (donated assets), but bounded by virtual offset
    assert!(price > SHARE_PRICE_PRECISION);
    assert!(price < 2 * SHARE_PRICE_PRECISION);
  }

  #[test]
  fn share_price_never_panics_on_extreme_u64_inputs() {
    // u64 inputs cannot overflow u128 in this formula (max numerator ≈ 1.8×10^25, u128::MAX ≈ 3.4×10^38).
    // Verify the function returns Ok (not Err, not panic) with boundary values.
    assert!(calculate_share_price(u64::MAX, u64::MAX).is_ok());
    assert!(calculate_share_price(u64::MAX, 1).is_ok());
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // calculate_shares_to_mint  (returns Result<u64>)
  // ──────────────────────────────────────────────────────────────────────────────

  #[test]
  fn shares_to_mint_first_deposit_returns_amount() {
    // When total_shares == 0, bypass the formula and return amount 1:1
    assert_eq!(calculate_shares_to_mint(5_000_000, 0, 0).unwrap(), 5_000_000);
  }

  #[test]
  fn shares_to_mint_first_deposit_regardless_of_assets() {
    // total_shares=0 always takes the early-return path, assets are irrelevant
    assert_eq!(calculate_shares_to_mint(1_000_000, 999_999_999, 0).unwrap(), 1_000_000);
  }

  #[test]
  fn shares_to_mint_equal_vault_returns_amount() {
    // assets=1M, shares=1M, deposit=1M
    // num = 1M * (1M + 1M) = 2M*M = 2*10^12
    // den = 1M + 1M = 2M
    // result = 2*10^12 / 2M = 1_000_000
    assert_eq!(
      calculate_shares_to_mint(1_000_000, 1_000_000, 1_000_000).unwrap(),
      1_000_000
    );
  }

  #[test]
  fn shares_to_mint_profitable_vault_returns_fewer_shares() {
    // assets=2M (doubled), shares=1M, deposit=1M → depositor gets diluted
    // num = 1M * (1M + 1M) = 2*10^12
    // den = 2M + 1M = 3M
    // result = 2*10^12 / 3M = 666_666
    assert_eq!(
      calculate_shares_to_mint(1_000_000, 2_000_000, 1_000_000).unwrap(),
      666_666
    );
  }

  #[test]
  fn shares_to_mint_zero_amount_returns_zero() {
    assert_eq!(calculate_shares_to_mint(0, 1_000_000, 1_000_000).unwrap(), 0);
  }

  #[test]
  fn shares_to_mint_overflow_returns_error() {
    // amount=u64::MAX, shares+VIRTUAL_OFFSET overflows u128 multiplication
    assert!(calculate_shares_to_mint(u64::MAX, 0, u64::MAX).is_err());
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // calculate_management_fee  (returns Result<u64>)
  // ──────────────────────────────────────────────────────────────────────────────

  #[test]
  fn mgmt_fee_zero_assets_returns_zero() {
    assert_eq!(calculate_management_fee(0, 63_072_000).unwrap(), 0);
  }

  #[test]
  fn mgmt_fee_zero_slots_returns_zero() {
    assert_eq!(calculate_management_fee(1_000_000, 0).unwrap(), 0);
  }

  #[test]
  fn mgmt_fee_one_year_on_known_assets() {
    // MGMT_FEE_PER_SLOT_SCALED calibrated to ~1% annual:
    // fee = total_assets * 158_548 * 63_072_000 / (1_000_000 * 10_000)
    // For total_assets=1000 over 1 year the fee comes out to ~999_993 ≈ 1 USDC (1_000_000).
    // Verify within 1% tolerance of the target (999_993 vs 1_000_000).
    let slots_per_year: u64 = 63_072_000;
    let fee = calculate_management_fee(1_000, slots_per_year).unwrap();
    let expected: u64 = 999_993; // computed: 1000 * 158548 * 63072000 / 10_000_000_000
    let tolerance = expected / 100; // 1%
    assert!(
      fee >= expected - tolerance && fee <= expected + tolerance,
      "fee {fee} not within 1% of {expected}"
    );
  }

  #[test]
  fn mgmt_fee_doubles_with_double_tvl() {
    // Fee is linear in total_assets: double TVL → double fee
    let slots: u64 = 63_072_000;
    let fee_single = calculate_management_fee(100_000_000, slots).unwrap();
    let fee_double = calculate_management_fee(200_000_000, slots).unwrap();
    // Should be exactly 2×, or within rounding (±1)
    assert!(
      fee_double >= fee_single * 2 - 1 && fee_double <= fee_single * 2 + 1,
      "double TVL fee {fee_double} should be 2× single {fee_single}"
    );
  }

  #[test]
  fn mgmt_fee_proportional_to_slots() {
    // Fee is linear in slots_elapsed: double time → double fee
    let assets: u64 = 10_000_000;
    let fee_half_year = calculate_management_fee(assets, 31_536_000).unwrap();
    let fee_full_year = calculate_management_fee(assets, 63_072_000).unwrap();
    // Should be exactly 2× within ±1 rounding
    assert!(
      fee_full_year >= fee_half_year * 2 - 1 && fee_full_year <= fee_half_year * 2 + 1,
      "full year fee {fee_full_year} should be 2× half year {fee_half_year}"
    );
  }

  #[test]
  fn mgmt_fee_overflow_returns_error() {
    // u64::MAX total_assets × MGMT_FEE_PER_SLOT_SCALED overflows u128 → Err
    assert!(calculate_management_fee(u64::MAX, u64::MAX).is_err());
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // calculate_performance_fee  (returns Result<u64>)
  // ──────────────────────────────────────────────────────────────────────────────

  #[test]
  fn perf_fee_no_gains_returns_zero() {
    // current_price == hwm_price → no gain
    assert_eq!(
      calculate_performance_fee(1_000_000, 1_000_000, 100_000_000).unwrap(),
      0
    );
  }

  #[test]
  fn perf_fee_below_hwm_returns_zero() {
    // current < hwm → loss, not above HWM
    assert_eq!(
      calculate_performance_fee(900_000, 1_000_000, 100_000_000).unwrap(),
      0
    );
  }

  #[test]
  fn perf_fee_ten_percent_gain_correct() {
    // current=1_100_000 (+10% over hwm=1_000_000), shares_burned=100_000_000
    // gain_per_share = 100_000
    // total_gain = 100_000 * 100_000_000 / 1_000_000 = 10_000_000
    // fee = 10_000_000 * 1000 / 10_000 = 1_000_000
    assert_eq!(
      calculate_performance_fee(1_100_000, 1_000_000, 100_000_000).unwrap(),
      1_000_000
    );
  }

  #[test]
  fn perf_fee_zero_shares_returns_zero() {
    // No shares burned → no fee, even with price gain
    assert_eq!(calculate_performance_fee(1_100_000, 1_000_000, 0).unwrap(), 0);
  }

  #[test]
  fn perf_fee_scales_with_shares_burned() {
    // Double the shares burned → double the fee
    let fee_100m = calculate_performance_fee(1_100_000, 1_000_000, 100_000_000).unwrap();
    let fee_200m = calculate_performance_fee(1_100_000, 1_000_000, 200_000_000).unwrap();
    assert_eq!(fee_200m, fee_100m * 2);
  }

  #[test]
  fn perf_fee_never_panics_on_extreme_u64_inputs() {
    // gain_per_share * shares_burned fits in u128: (u64::MAX)^2 = 2^128 - 2^65 + 1 < u128::MAX.
    // Verify the function returns Ok (not Err, not panic) with boundary values.
    assert!(calculate_performance_fee(u64::MAX, 1, u64::MAX).is_ok());
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // check_oracle_divergence
  // ──────────────────────────────────────────────────────────────────────────────

  #[test]
  fn oracle_divergence_equal_values_is_false() {
    assert!(!check_oracle_divergence(1_000_000, 1_000_000));
  }

  #[test]
  fn oracle_divergence_zero_assets_is_false() {
    // Empty vault — no divergence check possible
    assert!(!check_oracle_divergence(0, 0));
  }

  #[test]
  fn oracle_divergence_half_percent_is_false() {
    // diff=5_000, threshold=10_000 (1% of 1M) → NOT exceeded
    assert!(!check_oracle_divergence(1_005_000, 1_000_000));
  }

  #[test]
  fn oracle_divergence_at_one_percent_boundary_is_false() {
    // diff=10_000 exactly equals threshold=10_000 → NOT exceeded (strict >)
    assert!(!check_oracle_divergence(1_010_000, 1_000_000));
  }

  #[test]
  fn oracle_divergence_just_above_threshold_is_true() {
    // diff=10_001, threshold=10_000 → exceeded
    assert!(check_oracle_divergence(1_010_001, 1_000_000));
  }

  #[test]
  fn oracle_divergence_two_percent_is_true() {
    // diff=20_000, threshold=10_000 → clearly exceeded
    assert!(check_oracle_divergence(1_020_000, 1_000_000));
  }

  #[test]
  fn oracle_divergence_negative_direction_also_detected() {
    // Snapshot below on-chain: diff=20_000, threshold=10_000
    assert!(check_oracle_divergence(980_000, 1_000_000));
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // check_drawdown_exceeded
  // ──────────────────────────────────────────────────────────────────────────────

  #[test]
  fn drawdown_no_drop_is_false() {
    // current == peak → no drawdown
    assert!(!check_drawdown_exceeded(100_000_000, 100_000_000, 500));
  }

  #[test]
  fn drawdown_zero_peak_is_false() {
    // Undefined ratio → guard against div-by-zero equivalent
    assert!(!check_drawdown_exceeded(50_000_000, 0, 500));
  }

  #[test]
  fn drawdown_current_above_peak_is_false() {
    // current > peak is treated as no drawdown
    assert!(!check_drawdown_exceeded(110_000_000, 100_000_000, 500));
  }

  #[test]
  fn drawdown_three_percent_within_five_percent_limit_is_false() {
    // peak=100M, current=97M, dd=3M, threshold=5M (500 bps = 5%) → NOT exceeded
    assert!(!check_drawdown_exceeded(97_000_000, 100_000_000, 500));
  }

  #[test]
  fn drawdown_six_percent_exceeds_five_percent_limit_is_true() {
    // peak=100M, current=94M, dd=6M, threshold=5M → exceeded
    assert!(check_drawdown_exceeded(94_000_000, 100_000_000, 500));
  }

  #[test]
  fn drawdown_exactly_at_limit_is_false() {
    // peak=100M, current=95M, dd=5M, threshold=5M → NOT exceeded (strict >)
    assert!(!check_drawdown_exceeded(95_000_000, 100_000_000, 500));
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // should_auto_halt
  // ──────────────────────────────────────────────────────────────────────────────

  #[test]
  fn auto_halt_no_drop_is_false() {
    // current == 24h → no drop
    assert!(!should_auto_halt(1_000_000, 1_000_000));
  }

  #[test]
  fn auto_halt_zero_24h_is_false() {
    // Undefined baseline → safe guard
    assert!(!should_auto_halt(500_000, 0));
  }

  #[test]
  fn auto_halt_ten_percent_drop_is_false() {
    // current=900_000 (90% of 1M) → above 85% threshold → no halt
    // threshold = 1_000_000 * 8500 / 10_000 = 850_000
    assert!(!should_auto_halt(900_000, 1_000_000));
  }

  #[test]
  fn auto_halt_at_threshold_boundary_is_false() {
    // current=850_000 == threshold=850_000 → NOT below (strict <), no halt
    assert!(!should_auto_halt(850_000, 1_000_000));
  }

  #[test]
  fn auto_halt_sixteen_percent_drop_triggers_halt() {
    // current=840_000 (84% of 1M) → below 85% threshold=850_000 → halt
    assert!(should_auto_halt(840_000, 1_000_000));
  }

  #[test]
  fn auto_halt_catastrophic_drop_triggers_halt() {
    // current=0 (total loss) → well below threshold
    assert!(should_auto_halt(0, 1_000_000));
  }
}
