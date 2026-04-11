# NanuqFi Ranger Earn Adaptor — Design Spec

**Date:** 2026-04-11
**Author:** RECTOR + CIPHER
**Status:** Approved
**Hackathon:** Ranger Build-A-Bear (deadline April 17, 2026)

---

## Overview

Build a Solana program (Anchor) that implements Ranger Earn's adaptor interface, enabling Ranger vaults to deposit USDC into NanuqFi's AI-powered yield routing allocator. NanuqFi becomes a yield routing primitive — a single strategy that Ranger vault managers can plug in, while our AI keeper routes capital across Kamino, Marginfi, and Lulo behind the scenes.

## Architecture

```
Ranger Vault (mainnet: vVoLTR... / devnet: mock)
    │
    │ CPI: deposit / withdraw (3-instruction interface)
    ▼
NanuqFi Adaptor Program (new Anchor program)
    │
    │ CPI: deposit / request_withdraw / withdraw
    ▼
NanuqFi Allocator Program (2QtJ5k... on devnet)
    │
    │ AI Keeper: allocate_to_protocol / recall_from_protocol
    ▼
Kamino / Marginfi / Lulo
```

The adaptor is a thin CPI bridge (~100 lines). It translates Ranger's interface into our allocator's existing instructions. The adaptor does not handle yield routing — the allocator + keeper handle everything.

## Strategy Identity

NanuqFi is a **single strategy** from Ranger's perspective. One strategy address = NanuqFi's AI routing engine. The vault manager adds one strategy and NanuqFi handles all multi-protocol routing internally.

Strategy PDA: `["nanuqfi_strategy", allocator_pda]`

## Adaptor Program

### Account State

```rust
#[account]
pub struct NanuqfiStrategy {
    pub allocator: Pubkey,       // NanuqFi allocator PDA
    pub risk_vault: Pubkey,      // Target vault (moderate)
    pub position_value: u64,     // Last reported value
    pub bump: u8,
}
```

### Instruction 1: `initialize`

Called once when Ranger vault manager adds NanuqFi as a strategy.

**Accounts (fixed by Ranger CPI):**
1. `payer` — signer, writable (pays for account creation)
2. `vault_strategy_auth` — signer via Ranger PDA
3. `strategy` — NanuqfiStrategy PDA (to be created)
4. `system_program`

**Remaining accounts (NanuqFi-specific):**
5. `allocator` — NanuqFi allocator PDA
6. `risk_vault` — target risk vault (moderate)

**Logic:**
- Create NanuqfiStrategy PDA
- Store allocator + risk_vault references
- CPI into allocator to create UserPosition for vault_strategy_auth (if needed)

### Instruction 2: `deposit`

Ranger vault has transferred USDC to `vault_strategy_asset_ata`. Adaptor routes it into our allocator.

**Accounts (fixed by Ranger CPI):**
1. `vault_strategy_auth` — signer via Ranger PDA
2. `strategy` — NanuqfiStrategy PDA
3. `vault_asset_mint` — USDC mint
4. `vault_strategy_asset_ata` — source USDC (already funded by Ranger)
5. `asset_token_program` — SPL Token

**Remaining accounts:**
6. `allocator` — NanuqFi allocator PDA
7. `risk_vault` — target vault
8. `user_position` — position PDA for vault_strategy_auth
9. `vault_usdc` — allocator's vault USDC token account
10. `share_mint` — vault share mint
11. `user_share_ata` — vault_strategy_auth's share token account
12. `token_program` — SPL Token

**Logic:**
1. CPI into allocator's `deposit` instruction
2. USDC moves from vault_strategy_asset_ata → allocator vault
3. Shares minted to vault_strategy_auth
4. Read risk_vault.total_assets for position value
5. Return position value via `sol_set_return_data`

### Instruction 3: `withdraw`

Ranger requests USDC back.

**Accounts:** Same as deposit, plus treasury accounts.

**Logic:**
1. CPI into allocator's `request_withdraw` (share amount)
2. CPI into allocator's `withdraw` (if instant redemption / devnet)
3. USDC moves from allocator vault → vault_strategy_asset_ata
4. Return remaining position value via `sol_set_return_data`

**Edge case:** If all USDC is deployed in protocols, the allocator's vault USDC balance may be insufficient. The keeper maintains a liquidity buffer. If withdraw fails due to insufficient liquidity, the transaction reverts and Ranger retries after keeper recalls funds.

## Position Value

The adaptor reads `risk_vault.total_assets` to compute the position value for Ranger. This value reflects yield accrued across all underlying protocols.

For a single depositor (Ranger vault), position value = total_assets. For multiple depositors, position value = (user_shares / total_shares) * total_assets.

The adaptor uses u128 intermediates to prevent overflow in the calculation.

## Mock Ranger Vault (Devnet Testing)

A minimal Anchor program (~50 lines) that simulates Ranger's vault CPI pattern:
- Holds USDC in an idle token account
- `deposit_strategy`: transfers USDC to vault_strategy_asset_ata, CPIs adaptor's deposit, reads return data
- `withdraw_strategy`: CPIs adaptor's withdraw, sweeps USDC back from vault_strategy_asset_ata

Lives in `programs/mock-ranger-vault/`. Test-only — never deployed to mainnet. Proves our adaptor handles Ranger's exact CPI interface.

## Deployment Plan (Devnet)

1. Build adaptor program (`programs/nanuqfi-adaptor/`)
2. Build mock Ranger vault (`programs/mock-ranger-vault/`)
3. Deploy both to devnet
4. Initialize: allocator → treasury → moderate vault (already done)
5. Initialize: mock vault → add adaptor → initialize strategy
6. Test: deposit USDC through mock vault → verify routing → withdraw
7. Keeper rebalances as normal

**Mainnet path (post-hackathon):** Replace mock vault with real Ranger vault address. Deploy adaptor + allocator to mainnet. One deploy, zero code changes.

## Which Risk Vault?

Default to **moderate** — balanced risk profile. The adaptor config stores the target vault. Future: allow vault managers to choose conservative/moderate/aggressive via initialize params.

## File Structure

```
programs/
  allocator/           → existing (27 instructions)
  nanuqfi-adaptor/     → NEW (~100 lines, 3 instructions)
  mock-ranger-vault/   → NEW (~50 lines, test-only)
```

## Testing

**Unit tests (Rust):**
- Account validation, PDA derivation, position value math
- Error cases: wrong authority, insufficient balance, already initialized
- ~10 tests

**Integration tests (TypeScript):**
- Mock vault → adaptor → allocator → deposit → verify position value
- Withdraw flow: recall → withdraw → verify USDC returned
- Keeper rebalance while Ranger position is active
- Edge case: withdraw with deployed funds
- ~15 tests

**Existing tests:** 828 tests unchanged. Adaptor adds ~25 tests → total ~853.

## Hackathon Submission Impact

| Judging Criteria | How Adaptor Helps |
|-----------------|-------------------|
| Strategy Quality & Edge | AI routing as a composable primitive — not just another vault |
| Risk Management | Same guardrails, same drawdown protection, proven on devnet |
| Technical Implementation | New Anchor program, clean CPI chain, full test suite |
| Production Viability | One deploy to mainnet — architecture proven end-to-end |
| Novelty & Innovation | First AI yield routing adaptor on Ranger — new primitive |

## Out of Scope

- Mainnet deployment (post-hackathon)
- Multi-vault strategy selection (future: let vault managers pick risk tier)
- Direct withdraw (Ranger's optional fast-path — not needed for hackathon)
- Reward claiming (no external reward tokens in our lending strategy)
