use anchor_lang::prelude::*;

pub mod errors;
pub mod state;

#[allow(unused_imports)]
use errors::AllocatorError;
use state::*;

declare_id!("2QtJ5kmxLuW2jYCFpJMtzZ7PCnKdoMwkeueYoDUi5z5P");

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
    ) -> Result<()> {
        let vault = &mut ctx.accounts.risk_vault;
        vault.allocator = ctx.accounts.allocator.key();
        vault.risk_level = risk_level;
        vault.drift_vault = ctx.accounts.drift_vault.key();
        vault.share_mint = Pubkey::default(); // set in Task 9b
        vault.total_shares = 0;
        vault.total_assets = 0;
        vault.peak_equity = 0;
        vault.current_equity = 0;
        vault.equity_24h_ago = 0;
        vault.last_rebalance_slot = 0;
        vault.rebalance_counter = 0;
        vault.last_mgmt_fee_slot = 0;
        vault.current_weights = vec![];
        vault.max_perp_allocation_bps = max_perp_bps;
        vault.max_lending_allocation_bps = max_lending_bps;
        vault.max_single_asset_bps = max_single_asset_bps;
        vault.max_drawdown_bps = max_drawdown_bps;
        vault.max_leverage_bps = max_leverage_bps;
        vault.redemption_period_slots = redemption_period_slots;
        vault.bump = ctx.bumps.risk_vault;
        Ok(())
    }
}

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
    pub system_program: Program<'info, System>,
}
