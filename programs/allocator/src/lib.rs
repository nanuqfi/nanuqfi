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
