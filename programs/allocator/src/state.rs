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
    pub total_fees_withdrawn: u64,
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
