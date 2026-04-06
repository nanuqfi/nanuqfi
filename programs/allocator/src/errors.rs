use anchor_lang::prelude::*;

#[error_code]
pub enum AllocatorError {
    #[msg("Weights must sum to 10000 (basis points)")]
    InvalidWeightSum,
    #[msg("Weight exceeds maximum allocation for this strategy")]
    WeightExceedsMax,
    #[msg("Negative weight value")]
    NegativeWeight,
    #[msg("Rebalance interval not met")]
    RebalanceTooSoon,
    #[msg("Allocation shift exceeds maximum per rebalance")]
    ShiftTooLarge,
    #[msg("Unauthorized: not the keeper authority")]
    UnauthorizedKeeper,
    #[msg("Unauthorized: not the admin")]
    UnauthorizedAdmin,
    #[msg("Allocator is halted")]
    AllocatorHalted,
    #[msg("Drawdown exceeds maximum for this vault tier")]
    DrawdownExceeded,
    #[msg("Oracle divergence exceeds threshold")]
    OracleDivergence,
    #[msg("Redemption period not elapsed")]
    RedemptionPeriodNotElapsed,
    #[msg("No pending withdrawal")]
    NoPendingWithdrawal,
    #[msg("Invalid risk level")]
    InvalidRiskLevel,
    #[msg("Vault already initialized")]
    VaultAlreadyInitialized,
    #[msg("Cannot loosen guardrails beyond initial values")]
    CannotLoosenGuardrails,
    #[msg("Keeper lease is active for another instance")]
    LeaseConflict,
    #[msg("Already has a pending withdrawal")]
    HasPendingWithdrawal,
    #[msg("Insufficient vault balance for withdrawal")]
    InsufficientBalance,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Vault capacity exceeded")]
    VaultCapacityExceeded,
    #[msg("Oracle price data is stale")]
    StaleOracle,
    #[msg("Insufficient liquid USDC in vault for withdrawal")]
    InsufficientLiquidity,
    #[msg("Protocol CPI failed")]
    ProtocolCpiFailed,
    #[msg("Deposit exceeds vault cap")]
    DepositCapExceeded,
    #[msg("Insufficient fees available for withdrawal")]
    InsufficientFees,
    #[msg("Arithmetic underflow in financial calculation")]
    ArithmeticUnderflow,
    #[msg("Arithmetic overflow in financial calculation")]
    ArithmeticOverflow,
    #[msg("First deposit must meet minimum amount")]
    DepositTooSmall,
}
