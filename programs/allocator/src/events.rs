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
  pub equity_snapshot: u64,
  pub slot: u64,
}

#[event]
pub struct AllocationEvent {
  pub risk_vault: Pubkey,
  pub protocol: Pubkey,
  pub amount: u64,
  pub direction: u8,
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
