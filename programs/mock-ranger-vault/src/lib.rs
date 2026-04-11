use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use nanuqfi_adaptor::program::NanuqfiAdaptor;

declare_id!("9RPiyNFfpo58qA4x7R2QgkA94hRW6cN48CBHxjVDewdZ");

#[program]
pub mod mock_ranger_vault {
  use super::*;

  /// Simulate Ranger's deposit_strategy: transfer USDC to strategy ATA, then CPI adaptor deposit.
  pub fn deposit_strategy(ctx: Context<MockDepositStrategy>, amount: u64) -> Result<()> {
    // 1. Transfer USDC from idle pool to vault_strategy_asset_ata
    let seeds: &[&[u8]] = &[b"mock_vault_auth", &[ctx.bumps.vault_auth]];
    token::transfer(
      CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
          from: ctx.accounts.vault_idle_usdc.to_account_info(),
          to: ctx.accounts.vault_strategy_asset_ata.to_account_info(),
          authority: ctx.accounts.vault_auth.to_account_info(),
        },
        &[seeds],
      ),
      amount,
    )?;

    // 2. CPI into adaptor's deposit with vault_strategy_auth as signer
    let strategy_key = ctx.accounts.strategy.key();
    let auth_seeds: &[&[u8]] = &[
      b"vault_strategy_auth",
      strategy_key.as_ref(),
      &[ctx.bumps.vault_strategy_auth],
    ];
    let cpi_program = ctx.accounts.adaptor_program.to_account_info();
    let cpi_accounts = nanuqfi_adaptor::cpi::accounts::AdaptorDeposit {
      vault_strategy_auth: ctx.accounts.vault_strategy_auth.to_account_info(),
      strategy: ctx.accounts.strategy.to_account_info(),
      usdc_mint: ctx.accounts.usdc_mint.to_account_info(),
      vault_strategy_asset_ata: ctx.accounts.vault_strategy_asset_ata.to_account_info(),
      allocator: ctx.accounts.allocator.to_account_info(),
      risk_vault: ctx.accounts.risk_vault.to_account_info(),
      user_position: ctx.accounts.user_position.to_account_info(),
      share_mint: ctx.accounts.share_mint.to_account_info(),
      user_share_ata: ctx.accounts.user_share_ata.to_account_info(),
      vault_usdc: ctx.accounts.vault_usdc.to_account_info(),
      allocator_program: ctx.accounts.allocator_program.to_account_info(),
      token_program: ctx.accounts.token_program.to_account_info(),
      system_program: ctx.accounts.system_program.to_account_info(),
    };
    nanuqfi_adaptor::cpi::deposit(
      CpiContext::new_with_signer(cpi_program, cpi_accounts, &[auth_seeds]),
      amount,
    )?;

    // 3. Read return data (position value)
    let (_program_id, return_data) =
      anchor_lang::solana_program::program::get_return_data()
        .ok_or(error!(ErrorCode::AccountNotInitialized))?;
    let position_value = u64::from_le_bytes(return_data[..8].try_into().unwrap());
    msg!(
      "Mock vault: deposited {}, position value: {}",
      amount,
      position_value
    );

    Ok(())
  }

  /// Simulate Ranger's withdraw_strategy: CPI adaptor withdraw, then sweep USDC back.
  pub fn withdraw_strategy(ctx: Context<MockWithdrawStrategy>, amount: u64) -> Result<()> {
    let strategy_key = ctx.accounts.strategy.key();
    let auth_seeds: &[&[u8]] = &[
      b"vault_strategy_auth",
      strategy_key.as_ref(),
      &[ctx.bumps.vault_strategy_auth],
    ];
    let cpi_program = ctx.accounts.adaptor_program.to_account_info();
    let cpi_accounts = nanuqfi_adaptor::cpi::accounts::AdaptorWithdraw {
      vault_strategy_auth: ctx.accounts.vault_strategy_auth.to_account_info(),
      strategy: ctx.accounts.strategy.to_account_info(),
      usdc_mint: ctx.accounts.usdc_mint.to_account_info(),
      vault_strategy_asset_ata: ctx.accounts.vault_strategy_asset_ata.to_account_info(),
      allocator: ctx.accounts.allocator.to_account_info(),
      risk_vault: ctx.accounts.risk_vault.to_account_info(),
      user_position: ctx.accounts.user_position.to_account_info(),
      treasury: ctx.accounts.treasury.to_account_info(),
      share_mint: ctx.accounts.share_mint.to_account_info(),
      user_share_ata: ctx.accounts.user_share_ata.to_account_info(),
      vault_usdc: ctx.accounts.vault_usdc.to_account_info(),
      treasury_usdc: ctx.accounts.treasury_usdc.to_account_info(),
      allocator_program: ctx.accounts.allocator_program.to_account_info(),
      token_program: ctx.accounts.token_program.to_account_info(),
    };
    nanuqfi_adaptor::cpi::withdraw(
      CpiContext::new_with_signer(cpi_program, cpi_accounts, &[auth_seeds]),
      amount,
    )?;

    // Sweep USDC from strategy ATA back to idle pool
    ctx.accounts.vault_strategy_asset_ata.reload()?;
    let balance = ctx.accounts.vault_strategy_asset_ata.amount;
    if balance > 0 {
      let sweep_seeds: &[&[u8]] = &[
        b"vault_strategy_auth",
        strategy_key.as_ref(),
        &[ctx.bumps.vault_strategy_auth],
      ];
      token::transfer(
        CpiContext::new_with_signer(
          ctx.accounts.token_program.to_account_info(),
          Transfer {
            from: ctx.accounts.vault_strategy_asset_ata.to_account_info(),
            to: ctx.accounts.vault_idle_usdc.to_account_info(),
            authority: ctx.accounts.vault_strategy_auth.to_account_info(),
          },
          &[sweep_seeds],
        ),
        balance,
      )?;
    }

    let (_program_id, return_data) =
      anchor_lang::solana_program::program::get_return_data()
        .ok_or(error!(ErrorCode::AccountNotInitialized))?;
    let remaining = u64::from_le_bytes(return_data[..8].try_into().unwrap());
    msg!(
      "Mock vault: withdrew {}, remaining position: {}",
      amount,
      remaining
    );

    Ok(())
  }
}

// ─── Account Contexts ───────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct MockDepositStrategy<'info> {
  #[account(mut)]
  pub manager: Signer<'info>,

  /// CHECK: PDA authority for the mock vault's idle pool
  #[account(seeds = [b"mock_vault_auth"], bump)]
  pub vault_auth: UncheckedAccount<'info>,

  /// CHECK: PDA authority for this strategy
  #[account(seeds = [b"vault_strategy_auth", strategy.key().as_ref()], bump)]
  pub vault_strategy_auth: UncheckedAccount<'info>,

  /// Vault's idle USDC pool
  #[account(mut)]
  pub vault_idle_usdc: Account<'info, TokenAccount>,

  /// Strategy-specific USDC account
  #[account(mut)]
  pub vault_strategy_asset_ata: Account<'info, TokenAccount>,

  pub usdc_mint: Account<'info, Mint>,

  // ─── Pass-through to adaptor ─────────────────────────────────
  /// CHECK: NanuqFi strategy account
  #[account(mut)]
  pub strategy: UncheckedAccount<'info>,
  /// CHECK: NanuqFi allocator
  #[account(mut)]
  pub allocator: UncheckedAccount<'info>,
  /// CHECK: NanuqFi risk vault
  #[account(mut)]
  pub risk_vault: UncheckedAccount<'info>,
  /// CHECK: User position
  #[account(mut)]
  pub user_position: UncheckedAccount<'info>,
  /// CHECK: Share mint
  #[account(mut)]
  pub share_mint: UncheckedAccount<'info>,
  /// CHECK: User share ATA
  #[account(mut)]
  pub user_share_ata: UncheckedAccount<'info>,
  /// CHECK: Vault USDC
  #[account(mut)]
  pub vault_usdc: UncheckedAccount<'info>,

  /// CHECK: NanuqFi allocator program
  pub allocator_program: UncheckedAccount<'info>,
  pub adaptor_program: Program<'info, NanuqfiAdaptor>,
  pub token_program: Program<'info, Token>,
  pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MockWithdrawStrategy<'info> {
  #[account(mut)]
  pub manager: Signer<'info>,

  /// CHECK: PDA authority for this strategy
  #[account(seeds = [b"vault_strategy_auth", strategy.key().as_ref()], bump)]
  pub vault_strategy_auth: UncheckedAccount<'info>,

  #[account(mut)]
  pub vault_idle_usdc: Account<'info, TokenAccount>,
  #[account(mut)]
  pub vault_strategy_asset_ata: Account<'info, TokenAccount>,
  pub usdc_mint: Account<'info, Mint>,

  // ─── Pass-through to adaptor ─────────────────────────────────
  /// CHECK: NanuqFi strategy
  #[account(mut)]
  pub strategy: UncheckedAccount<'info>,
  /// CHECK: NanuqFi allocator
  #[account(mut)]
  pub allocator: UncheckedAccount<'info>,
  /// CHECK: NanuqFi risk vault
  #[account(mut)]
  pub risk_vault: UncheckedAccount<'info>,
  /// CHECK: User position
  #[account(mut)]
  pub user_position: UncheckedAccount<'info>,
  /// CHECK: Treasury
  #[account(mut)]
  pub treasury: UncheckedAccount<'info>,
  /// CHECK: Share mint
  #[account(mut)]
  pub share_mint: UncheckedAccount<'info>,
  /// CHECK: User share ATA
  #[account(mut)]
  pub user_share_ata: UncheckedAccount<'info>,
  /// CHECK: Vault USDC
  #[account(mut)]
  pub vault_usdc: UncheckedAccount<'info>,
  /// CHECK: Treasury USDC
  #[account(mut)]
  pub treasury_usdc: UncheckedAccount<'info>,

  /// CHECK: NanuqFi allocator program
  pub allocator_program: UncheckedAccount<'info>,
  pub adaptor_program: Program<'info, NanuqfiAdaptor>,
  pub token_program: Program<'info, Token>,
}
