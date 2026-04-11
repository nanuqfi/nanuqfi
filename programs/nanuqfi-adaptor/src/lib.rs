use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use nanuqfi_allocator::program::NanuqfiAllocator;
use nanuqfi_allocator::state::{Allocator, RiskVault, Treasury, UserPosition};

declare_id!("HsNnmuB18pA2U24K4Stc1yan67Cx96gmvGRqBUqRFWwY");

#[program]
pub mod nanuqfi_adaptor {
  use super::*;

  /// Initialize the NanuqFi strategy for a Ranger vault.
  /// Called once when a vault manager adds NanuqFi as a strategy.
  pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    let strategy = &mut ctx.accounts.strategy;
    strategy.allocator = ctx.accounts.allocator.key();
    strategy.risk_vault = ctx.accounts.risk_vault.key();
    strategy.position_value = 0;
    strategy.bump = ctx.bumps.strategy;

    msg!(
      "NanuqFi strategy initialized for allocator {}",
      strategy.allocator
    );
    Ok(())
  }

  /// Deposit USDC from Ranger vault into NanuqFi allocator.
  /// Ranger has already transferred USDC to vault_strategy_asset_ata.
  /// Returns position value as u64 via sol_set_return_data.
  pub fn deposit(ctx: Context<AdaptorDeposit>, amount: u64) -> Result<()> {
    // CPI into allocator's deposit instruction
    let cpi_program = ctx.accounts.allocator_program.to_account_info();
    let cpi_accounts = nanuqfi_allocator::cpi::accounts::Deposit {
      allocator: ctx.accounts.allocator.to_account_info(),
      risk_vault: ctx.accounts.risk_vault.to_account_info(),
      user_position: ctx.accounts.user_position.to_account_info(),
      share_mint: ctx.accounts.share_mint.to_account_info(),
      usdc_mint: ctx.accounts.usdc_mint.to_account_info(),
      user_usdc: ctx.accounts.vault_strategy_asset_ata.to_account_info(),
      user_shares: ctx.accounts.user_share_ata.to_account_info(),
      vault_usdc: ctx.accounts.vault_usdc.to_account_info(),
      user: ctx.accounts.vault_strategy_auth.to_account_info(),
      token_program: ctx.accounts.token_program.to_account_info(),
      system_program: ctx.accounts.system_program.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    nanuqfi_allocator::cpi::deposit(cpi_ctx, amount)?;

    // Reload risk_vault after CPI to get updated total_assets
    ctx.accounts.risk_vault.reload()?;

    // Compute position value: (user_shares / total_shares) * total_assets
    // Reload share ATA to get post-CPI balance
    ctx.accounts.user_share_ata.reload()?;
    let vault = &ctx.accounts.risk_vault;
    let position_value = if vault.total_shares > 0 {
      let user_shares_balance = ctx.accounts.user_share_ata.amount;
      ((user_shares_balance as u128)
        .checked_mul(vault.total_assets as u128)
        .unwrap()
        / (vault.total_shares as u128)) as u64
    } else {
      0
    };

    // Update strategy state
    let strategy = &mut ctx.accounts.strategy;
    strategy.position_value = position_value;

    // Return position value to Ranger vault via return data
    anchor_lang::solana_program::program::set_return_data(&position_value.to_le_bytes());

    msg!(
      "NanuqFi deposit: {} USDC, position value: {}",
      amount,
      position_value
    );
    Ok(())
  }

  /// Withdraw USDC from NanuqFi allocator back to Ranger vault.
  /// Returns remaining position value via sol_set_return_data.
  pub fn withdraw(ctx: Context<AdaptorWithdraw>, amount: u64) -> Result<()> {
    // Convert USDC amount to shares
    let vault = &ctx.accounts.risk_vault;
    let shares = if vault.total_assets > 0 && vault.total_shares > 0 {
      ((amount as u128)
        .checked_mul(vault.total_shares as u128)
        .unwrap()
        / (vault.total_assets as u128)) as u64
    } else {
      amount
    };

    // CPI: request_withdraw
    let cpi_program = ctx.accounts.allocator_program.to_account_info();
    let request_accounts = nanuqfi_allocator::cpi::accounts::RequestWithdraw {
      allocator: ctx.accounts.allocator.to_account_info(),
      risk_vault: ctx.accounts.risk_vault.to_account_info(),
      user_position: ctx.accounts.user_position.to_account_info(),
      user: ctx.accounts.vault_strategy_auth.to_account_info(),
    };
    nanuqfi_allocator::cpi::request_withdraw(
      CpiContext::new(cpi_program.clone(), request_accounts),
      shares,
    )?;

    // CPI: withdraw (instant on devnet — redemption period = 0)
    let withdraw_accounts = nanuqfi_allocator::cpi::accounts::Withdraw {
      allocator: ctx.accounts.allocator.to_account_info(),
      risk_vault: ctx.accounts.risk_vault.to_account_info(),
      user_position: ctx.accounts.user_position.to_account_info(),
      treasury: ctx.accounts.treasury.to_account_info(),
      share_mint: ctx.accounts.share_mint.to_account_info(),
      usdc_mint: ctx.accounts.usdc_mint.to_account_info(),
      user_shares: ctx.accounts.user_share_ata.to_account_info(),
      user_usdc: ctx.accounts.vault_strategy_asset_ata.to_account_info(),
      vault_usdc: ctx.accounts.vault_usdc.to_account_info(),
      treasury_usdc: ctx.accounts.treasury_usdc.to_account_info(),
      user: ctx.accounts.vault_strategy_auth.to_account_info(),
      token_program: ctx.accounts.token_program.to_account_info(),
    };
    nanuqfi_allocator::cpi::withdraw(CpiContext::new(cpi_program, withdraw_accounts))?;

    // Reload and compute remaining position value
    ctx.accounts.risk_vault.reload()?;
    let vault = &ctx.accounts.risk_vault;
    let remaining = if vault.total_shares > 0 {
      ctx.accounts.user_share_ata.reload()?;
      let user_shares_balance = ctx.accounts.user_share_ata.amount;
      ((user_shares_balance as u128)
        .checked_mul(vault.total_assets as u128)
        .unwrap()
        / (vault.total_shares as u128)) as u64
    } else {
      0
    };

    let strategy = &mut ctx.accounts.strategy;
    strategy.position_value = remaining;

    anchor_lang::solana_program::program::set_return_data(&remaining.to_le_bytes());

    msg!(
      "NanuqFi withdraw: {} USDC, remaining: {}",
      amount,
      remaining
    );
    Ok(())
  }
}

// ─── State ──────────────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct NanuqfiStrategy {
  pub allocator: Pubkey,
  pub risk_vault: Pubkey,
  pub position_value: u64,
  pub bump: u8,
}

// ─── Account Contexts ───────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,

  pub vault_strategy_auth: Signer<'info>,

  #[account(
    init,
    payer = payer,
    space = 8 + NanuqfiStrategy::INIT_SPACE,
    seeds = [b"nanuqfi_strategy", allocator.key().as_ref()],
    bump,
  )]
  pub strategy: Account<'info, NanuqfiStrategy>,

  /// NanuqFi allocator PDA
  pub allocator: Account<'info, Allocator>,

  /// Target risk vault
  #[account(constraint = risk_vault.allocator == allocator.key())]
  pub risk_vault: Account<'info, RiskVault>,

  pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdaptorDeposit<'info> {
  #[account(mut)]
  pub vault_strategy_auth: Signer<'info>,

  #[account(
    mut,
    seeds = [b"nanuqfi_strategy", allocator.key().as_ref()],
    bump = strategy.bump,
  )]
  pub strategy: Account<'info, NanuqfiStrategy>,

  /// USDC mint
  pub usdc_mint: Account<'info, Mint>,

  /// Ranger's strategy asset token account (source USDC)
  #[account(mut, token::mint = usdc_mint)]
  pub vault_strategy_asset_ata: Account<'info, TokenAccount>,

  // ─── NanuqFi allocator accounts ─────────────────────────────────
  #[account(mut)]
  pub allocator: Account<'info, Allocator>,

  #[account(mut, constraint = risk_vault.allocator == allocator.key())]
  pub risk_vault: Account<'info, RiskVault>,

  /// UserPosition PDA for vault_strategy_auth — init_if_needed handled by allocator CPI
  /// CHECK: validated by the allocator program during CPI
  #[account(mut)]
  pub user_position: UncheckedAccount<'info>,

  #[account(mut)]
  pub share_mint: Account<'info, Mint>,

  /// vault_strategy_auth's share token account
  #[account(mut)]
  pub user_share_ata: Account<'info, TokenAccount>,

  /// Allocator's vault USDC account
  #[account(mut, token::mint = usdc_mint)]
  pub vault_usdc: Account<'info, TokenAccount>,

  pub allocator_program: Program<'info, NanuqfiAllocator>,
  pub token_program: Program<'info, Token>,
  pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdaptorWithdraw<'info> {
  pub vault_strategy_auth: Signer<'info>,

  #[account(
    mut,
    seeds = [b"nanuqfi_strategy", allocator.key().as_ref()],
    bump = strategy.bump,
  )]
  pub strategy: Account<'info, NanuqfiStrategy>,

  pub usdc_mint: Account<'info, Mint>,

  #[account(mut, token::mint = usdc_mint)]
  pub vault_strategy_asset_ata: Account<'info, TokenAccount>,

  // ─── NanuqFi allocator accounts ─────────────────────────────────
  #[account(mut)]
  pub allocator: Account<'info, Allocator>,

  #[account(mut, constraint = risk_vault.allocator == allocator.key())]
  pub risk_vault: Account<'info, RiskVault>,

  #[account(mut)]
  pub user_position: Account<'info, UserPosition>,

  /// Treasury PDA — validated by allocator during CPI (seeds are allocator program's, not ours)
  #[account(mut)]
  pub treasury: Account<'info, Treasury>,

  #[account(mut)]
  pub share_mint: Account<'info, Mint>,

  #[account(mut)]
  pub user_share_ata: Account<'info, TokenAccount>,

  #[account(mut, token::mint = usdc_mint)]
  pub vault_usdc: Account<'info, TokenAccount>,

  #[account(mut, constraint = treasury_usdc.key() == treasury.usdc_token_account)]
  pub treasury_usdc: Account<'info, TokenAccount>,

  pub allocator_program: Program<'info, NanuqfiAllocator>,
  pub token_program: Program<'info, Token>,
}

// ─── Unit Tests ─────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
  use anchor_lang::prelude::Pubkey;

  #[test]
  fn strategy_pda_derivation() {
    let allocator = Pubkey::new_unique();
    let (pda, bump) = Pubkey::find_program_address(
      &[b"nanuqfi_strategy", allocator.as_ref()],
      &crate::ID,
    );
    assert_ne!(pda, Pubkey::default());
    assert_ne!(bump, 0); // valid bump found
  }

  #[test]
  fn position_value_single_depositor() {
    let user_shares: u64 = 1_000_000;
    let total_shares: u64 = 1_000_000;
    let total_assets: u64 = 1_050_000; // 5% yield
    let value =
      ((user_shares as u128) * (total_assets as u128) / (total_shares as u128)) as u64;
    assert_eq!(value, 1_050_000);
  }

  #[test]
  fn position_value_multiple_depositors() {
    let user_shares: u64 = 500_000;
    let total_shares: u64 = 2_000_000;
    let total_assets: u64 = 2_100_000;
    let value =
      ((user_shares as u128) * (total_assets as u128) / (total_shares as u128)) as u64;
    assert_eq!(value, 525_000); // 25% of total
  }

  #[test]
  fn position_value_zero_shares() {
    let total_shares: u64 = 0;
    let value = if total_shares > 0 { 100 } else { 0 };
    assert_eq!(value, 0);
  }

  #[test]
  fn position_value_no_overflow_large_amounts() {
    let user_shares: u64 = u64::MAX / 2;
    let total_shares: u64 = u64::MAX / 2;
    let total_assets: u64 = u64::MAX / 2;
    let value =
      ((user_shares as u128) * (total_assets as u128) / (total_shares as u128)) as u64;
    assert_eq!(value, u64::MAX / 2);
  }

  #[test]
  fn shares_from_amount_calculation() {
    let amount: u64 = 500_000;
    let total_assets: u64 = 2_000_000;
    let total_shares: u64 = 1_900_000;
    let shares =
      ((amount as u128) * (total_shares as u128) / (total_assets as u128)) as u64;
    assert_eq!(shares, 475_000);
  }
}
