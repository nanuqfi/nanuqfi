#[cfg(test)]
mod tests {
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

    let mut sorted = codes.clone();
    sorted.sort();
    sorted.dedup();
    assert_eq!(sorted.len(), codes.len(), "Duplicate error codes found");
  }

  #[test]
  fn error_codes_start_at_zero() {
    // In Anchor, error codes are offset by 6000 at runtime (InvalidWeightSum = 0 + 6000)
    assert_eq!(AllocatorError::InvalidWeightSum as u32, 0);
  }

  #[test]
  fn error_codes_are_sequential() {
    let first = AllocatorError::InvalidWeightSum as u32;
    let last = AllocatorError::PendingWithdrawalExists as u32;
    assert_eq!(last - first, 34);
  }
}
