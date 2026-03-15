# NanuqFi Integration & Deployment — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire existing NanuqFi components to real Drift Protocol — full execution pipeline from USDC deposit to on-chain positions to withdrawal.

**Architecture:** Keeper-mediated model. User deposits go to allocator's vault_usdc. Keeper calls `allocate_to_drift` / `recall_from_drift` instructions to move funds to/from Drift vaults via CPI. Keeper manages strategy execution as Drift trading delegate. Frontend connects via Solana wallet adapter + keeper REST API.

**Tech Stack:** TypeScript, @drift-labs/sdk, @solana/wallet-adapter-react, Anchor/Rust, Docker, GitHub Actions, nginx

**Spec:** `docs/superpowers/specs/2026-03-15-nanuqfi-integration-design.md`

**Repos:**
- Core monorepo: `~/local-dev/nanuqfi/`
- Keeper: `~/local-dev/nanuqfi-keeper/`
- Frontend: `~/local-dev/nanuqfi-app/`

---

## File Structure

### Core Monorepo (`~/local-dev/nanuqfi/`)

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `packages/backend-drift/src/drift-connection.ts` | Replace placeholder with real DriftClient + failover |
| Create | `packages/backend-drift/src/utils/bn-convert.ts` | bigint ↔ BN conversion utilities |
| Create | `packages/backend-drift/src/utils/drift-data-api.ts` | Drift Data API HTTP client (rates, funding) |
| Modify | `packages/backend-drift/src/backends/lending.ts` | Add real mode alongside mock |
| Modify | `packages/backend-drift/src/backends/basis-trade.ts` | Add real mode |
| Modify | `packages/backend-drift/src/backends/funding.ts` | Add real mode |
| Modify | `packages/backend-drift/src/backends/jito-dn.ts` | Add real mode |
| Modify | `packages/backend-drift/src/index.ts` | Export new utils |
| Create | `packages/backend-drift/tests/integration/lending.int.test.ts` | Devnet integration test |
| Create | `packages/backend-drift/tests/integration/basis-trade.int.test.ts` | Devnet integration test |
| Create | `packages/backend-drift/tests/integration/funding.int.test.ts` | Devnet integration test |
| Create | `packages/backend-drift/tests/integration/jito-dn.int.test.ts` | Devnet integration test |
| Modify | `programs/allocator/src/errors.rs` | Add 5 new error variants |
| Modify | `programs/allocator/src/state.rs` | Add `deposit_cap` to RiskVault |
| Modify | `programs/allocator/src/lib.rs` | Add `allocate_to_drift`, `recall_from_drift`, fix burn, add deposit cap check |
| Create | `scripts/setup-drift-vaults.ts` | One-time Drift vault creation script |
| Create | `.github/workflows/ci.yml` | CI pipeline for core monorepo |

### Keeper (`~/local-dev/nanuqfi-keeper/`)

| Action | Path | Purpose |
|--------|------|---------|
| Create | `src/drift/client.ts` | DriftClient wrapper with failover + health check |
| Create | `src/drift/data-api.ts` | Drift Data API client (rates, funding) |
| Create | `src/drift/trading.ts` | Trading delegate operations (place/cancel perp orders) |
| Modify | `src/config.ts` | Add Drift connection + Jupiter config |
| Modify | `src/keeper.ts` | Wire real DriftClient, inject into cycle |
| Modify | `src/engine/algorithm-engine.ts` | Accept real data feeds |
| Create | `src/drift/jupiter.ts` | Jupiter swap client for JitoSOL |
| Create | `tests/integration/keeper-cycle.int.test.ts` | Full cycle integration test |
| Create | `docker-compose.yml` | Production compose with secrets |
| Create | `.github/workflows/deploy.yml` | CI/CD → GHCR → VPS |

### Frontend (`~/local-dev/nanuqfi-app/`)

| Action | Path | Purpose |
|--------|------|---------|
| Create | `src/providers/wallet-provider.tsx` | Solana wallet adapter setup |
| Create | `src/providers/connection-provider.tsx` | RPC connection context |
| Create | `src/hooks/use-allocator.ts` | On-chain data hooks (PDAs, balances) |
| Create | `src/hooks/use-keeper-api.ts` | Keeper REST API polling hooks |
| Create | `src/lib/transactions.ts` | Transaction builders (deposit, request_withdraw, withdraw) |
| Create | `src/lib/errors.ts` | Anchor error code → human message mapping |
| Modify | `src/app/layout.tsx` | Wrap with wallet + connection providers |
| Modify | `src/app/page.tsx` | Real TVL, APY from on-chain + keeper |
| Modify | `src/app/vaults/page.tsx` | Real vault data |
| Modify | `src/app/vaults/[riskLevel]/page.tsx` | Real data + deposit/withdraw flows |
| Modify | `src/app/activity/page.tsx` | Real keeper decisions |
| Create | `Dockerfile` | Next.js standalone production image |
| Create | `docker-compose.yml` | Production compose |
| Create | `.github/workflows/deploy.yml` | CI/CD → GHCR → VPS |

---

## Chunk 1: Foundation (Days 1-2)

### Task 1: DriftClient Connection Layer

**Files:**
- Modify: `packages/backend-drift/src/drift-connection.ts`
- Create: `packages/backend-drift/src/utils/bn-convert.ts`
- Create: `packages/backend-drift/tests/drift-connection.test.ts`
- Modify: `packages/backend-drift/package.json` (verify @drift-labs/sdk version)

**Context:** The current `drift-connection.ts` is a placeholder that throws. Replace with a real DriftClient factory that handles initialization, subscription, and failover. Also create BN/bigint conversion utils since the interfaces use `bigint` but Drift SDK uses `BN`.

- [ ] **Step 1: Write tests for BN conversion utilities**

```typescript
// packages/backend-drift/src/utils/bn-convert.test.ts
import { describe, it, expect } from 'vitest'
import { toBN, fromBN, toSpotPrecision, fromSpotPrecision } from './bn-convert'
import { BN } from '@coral-xyz/anchor'

describe('bn-convert', () => {
  it('converts bigint to BN', () => {
    expect(toBN(1_000_000n).toString()).toBe('1000000')
  })

  it('converts BN to bigint', () => {
    expect(fromBN(new BN(1_000_000))).toBe(1_000_000n)
  })

  it('converts zero', () => {
    expect(toBN(0n).toString()).toBe('0')
    expect(fromBN(new BN(0))).toBe(0n)
  })

  it('handles USDC precision (6 decimals)', () => {
    // 100 USDC = 100_000_000 in 6-decimal precision
    expect(toSpotPrecision(100, 6)).toBe(100_000_000n)
    expect(fromSpotPrecision(100_000_000n, 6)).toBe(100)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/local-dev/nanuqfi/packages/backend-drift && pnpm test`
Expected: FAIL — module not found

> **Note:** Unit tests use `src/**/*.test.ts` glob (vitest default). Integration tests (Tasks 7-10) use a separate config `vitest.integration.config.ts` with `include: ['tests/integration/**/*.int.test.ts']` and 30s timeout.

- [ ] **Step 3: Implement BN conversion utilities**

```typescript
// packages/backend-drift/src/utils/bn-convert.ts
import { BN } from '@coral-xyz/anchor'

export function toBN(value: bigint): BN {
  return new BN(value.toString())
}

export function fromBN(value: BN): bigint {
  return BigInt(value.toString())
}

export function toSpotPrecision(amount: number, decimals: number): bigint {
  return BigInt(Math.round(amount * 10 ** decimals))
}

export function fromSpotPrecision(amount: bigint, decimals: number): number {
  return Number(amount) / 10 ** decimals
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run: `cd ~/local-dev/nanuqfi && pnpm turbo test --filter=@nanuqfi/backend-drift`
Expected: PASS (existing 43 tests + new conversion tests)

- [ ] **Step 5: Write tests for DriftClient connection**

```typescript
// packages/backend-drift/tests/drift-connection.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createDriftConnection, type DriftConnectionConfig } from '../src/drift-connection'

describe('createDriftConnection', () => {
  it('throws on invalid RPC URL', async () => {
    const config: DriftConnectionConfig = {
      rpcUrl: 'http://invalid-url',
      walletKeypairPath: '/nonexistent/path',
      env: 'devnet',
    }
    await expect(createDriftConnection(config)).rejects.toThrow()
  })

  it('accepts valid config shape', () => {
    const config: DriftConnectionConfig = {
      rpcUrl: 'https://api.devnet.solana.com',
      rpcFallbackUrl: 'https://devnet.helius-rpc.com',
      walletKeypairPath: '/tmp/test-wallet.json',
      env: 'devnet',
      commitment: 'confirmed',
    }
    // Config is valid — type check passes
    expect(config.rpcUrl).toBeDefined()
    expect(config.rpcFallbackUrl).toBeDefined()
    expect(config.commitment).toBe('confirmed')
  })
})
```

- [ ] **Step 6: Implement DriftClient connection with failover**

Replace the placeholder in `drift-connection.ts` with real implementation including RPC failover:

```typescript
// packages/backend-drift/src/drift-connection.ts
import { Connection, type Commitment } from '@solana/web3.js'
import { Wallet, loadKeypair, DriftClient } from '@drift-labs/sdk'

export interface DriftConnectionConfig {
  rpcUrl: string
  rpcFallbackUrl?: string
  walletKeypairPath: string
  env?: 'devnet' | 'mainnet-beta'
  commitment?: Commitment
}

export async function createDriftConnection(
  config: DriftConnectionConfig
): Promise<DriftClient> {
  const commitment = config.commitment ?? 'confirmed'
  let connection: Connection

  try {
    connection = new Connection(config.rpcUrl, { commitment })
    // Verify primary RPC is reachable
    await connection.getSlot()
  } catch {
    if (!config.rpcFallbackUrl) throw new Error(`Primary RPC unreachable: ${config.rpcUrl}`)
    // Failover to fallback
    connection = new Connection(config.rpcFallbackUrl, { commitment })
    await connection.getSlot() // If this also fails, let it throw
  }

  const wallet = new Wallet(loadKeypair(config.walletKeypairPath))

  const driftClient = new DriftClient({
    connection,
    wallet,
    env: config.env ?? 'devnet',
  })

  await driftClient.subscribe()

  return driftClient
}

/**
 * Check if DriftClient subscription is healthy.
 * Call before every keeper cycle — never operate on stale data.
 */
export function isSubscriptionHealthy(client: DriftClient): boolean {
  try {
    return client.isSubscribed
  } catch {
    return false
  }
}
```

> **Connection resilience note:** Full circuit breaker pattern (3 consecutive failures → switch, half-open probe every 60s, WebSocket exponential backoff reconnect) is implemented in the keeper's `src/drift/client.ts` (Task 11), which wraps this connection layer. The backend-drift package provides the basic connection; the keeper adds operational resilience on top.

- [ ] **Step 7: Export new utilities from index.ts**

Add to `packages/backend-drift/src/index.ts`:

```typescript
export { toBN, fromBN, toSpotPrecision, fromSpotPrecision } from './utils/bn-convert'
```

- [ ] **Step 8: Run all tests (existing + new)**

Run: `cd ~/local-dev/nanuqfi && pnpm turbo test --filter=@nanuqfi/backend-drift`
Expected: All 43 existing tests + new tests PASS

- [ ] **Step 9: Commit**

```bash
cd ~/local-dev/nanuqfi
git add packages/backend-drift/src/drift-connection.ts packages/backend-drift/src/utils/ packages/backend-drift/tests/
git commit -m "feat(backend-drift): add DriftClient connection layer with BN conversion utils"
```

---

### Task 2: Drift Data API Client

**Files:**
- Create: `packages/backend-drift/src/utils/drift-data-api.ts`
- Create: `packages/backend-drift/src/utils/drift-data-api.test.ts`

**Context:** HTTP client for Drift's Data API (funding rates, lending rates, borrow rates). Used by backends for `getExpectedYield()` and `shouldAutoExit()` in real mode. Stateless — just HTTP fetches with error handling and rate conversion math.

- [ ] **Step 1: Write tests for Drift Data API client**

```typescript
// packages/backend-drift/src/utils/drift-data-api.test.ts
import { describe, it, expect } from 'vitest'
import {
  parseFundingRate,
  parseDepositRate,
  type RawFundingRate,
  DRIFT_DATA_API_URL,
} from './drift-data-api'

describe('drift-data-api', () => {
  it('has correct base URL', () => {
    expect(DRIFT_DATA_API_URL).toBe('https://data.api.drift.trade')
  })

  it('parses raw funding rate to annualized APR', () => {
    // Real Drift format: fundingRate is raw PRICE_PRECISION, oraclePriceTwap is PRICE_PRECISION
    const raw: RawFundingRate = {
      slot: 1000,
      fundingRate: '1000000', // 1e6
      oraclePriceTwap: '150000000', // $150 in 1e6
      markPriceTwap: '150100000',
      fundingRateLong: '1000000',
      fundingRateShort: '-1000000',
    }
    const result = parseFundingRate(raw)
    expect(result.hourlyRate).toBeCloseTo(1e6 / 1e9 / (150e6 / 1e6), 9)
    expect(result.annualizedApr).toBeCloseTo(result.hourlyRate * 24 * 365 * 100, 2)
  })

  it('parses deposit rate string to decimal', () => {
    // Drift returns rate as string decimal
    expect(parseDepositRate('0.08')).toBe(0.08)
    expect(parseDepositRate('0')).toBe(0)
  })
})
```

- [ ] **Step 2: Run test — verify fails**

Run: `cd ~/local-dev/nanuqfi && pnpm turbo test --filter=@nanuqfi/backend-drift`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Drift Data API client**

```typescript
// packages/backend-drift/src/utils/drift-data-api.ts
export const DRIFT_DATA_API_URL = 'https://data.api.drift.trade'

export interface RawFundingRate {
  slot: number
  fundingRate: string
  oraclePriceTwap: string
  markPriceTwap: string
  fundingRateLong: string
  fundingRateShort: string
}

export interface ParsedFundingRate {
  slot: number
  hourlyRate: number
  annualizedApr: number
  oraclePrice: number
}

export function parseFundingRate(raw: RawFundingRate): ParsedFundingRate {
  const fundingRate = parseFloat(raw.fundingRate) / 1e9
  const oraclePrice = parseFloat(raw.oraclePriceTwap) / 1e6
  const hourlyRate = fundingRate / oraclePrice
  return {
    slot: raw.slot,
    hourlyRate,
    annualizedApr: hourlyRate * 24 * 365 * 100,
    oraclePrice,
  }
}

export function parseDepositRate(rate: string): number {
  return parseFloat(rate)
}

export async function fetchFundingRates(
  marketName: string,
  baseUrl = DRIFT_DATA_API_URL,
): Promise<RawFundingRate[]> {
  const url = `${baseUrl}/fundingRates?marketName=${marketName}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Drift Data API error: ${res.status} ${res.statusText}`)
  const data = await res.json()
  return data.fundingRates ?? []
}

export async function fetchDepositRate(
  marketIndex: number,
  baseUrl = DRIFT_DATA_API_URL,
): Promise<number> {
  const url = `${baseUrl}/rateHistory?marketIndex=${marketIndex}&type=deposit`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Drift Data API error: ${res.status} ${res.statusText}`)
  const data = await res.json()
  const rates = data.rates ?? []
  if (rates.length === 0) return 0
  return parseDepositRate(rates[rates.length - 1].rate)
}

export async function fetchBorrowRate(
  marketIndex: number,
  baseUrl = DRIFT_DATA_API_URL,
): Promise<number> {
  const url = `${baseUrl}/rateHistory?marketIndex=${marketIndex}&type=borrow`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Drift Data API error: ${res.status} ${res.statusText}`)
  const data = await res.json()
  const rates = data.rates ?? []
  if (rates.length === 0) return 0
  return parseDepositRate(rates[rates.length - 1].rate)
}
```

- [ ] **Step 4: Export from index.ts**

Add to `packages/backend-drift/src/index.ts`:

```typescript
export { fetchFundingRates, fetchDepositRate, fetchBorrowRate, parseFundingRate } from './utils/drift-data-api'
export type { RawFundingRate, ParsedFundingRate } from './utils/drift-data-api'
```

- [ ] **Step 5: Run all tests**

Run: `cd ~/local-dev/nanuqfi && pnpm turbo test --filter=@nanuqfi/backend-drift`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
cd ~/local-dev/nanuqfi
git add packages/backend-drift/src/utils/drift-data-api.ts packages/backend-drift/src/utils/drift-data-api.test.ts packages/backend-drift/src/index.ts
git commit -m "feat(backend-drift): add Drift Data API client for rates and funding"
```

---

### Task 3: Allocator Program Changes

**Files:**
- Modify: `programs/allocator/src/errors.rs`
- Modify: `programs/allocator/src/state.rs`
- Modify: `programs/allocator/src/lib.rs`

**Context:** Add new error variants, deposit_cap field, fix burn authority, and add the two new CPI instructions (`allocate_to_drift`, `recall_from_drift`). The CPI instructions will initially be scaffolded (account structs defined, validation logic in place) with the actual Drift CPI call added in Task 8 after verifying Drift vault accounts on devnet.

- [ ] **Step 1: Add new error variants to errors.rs**

Add after `MathOverflow`:

```rust
#[msg("Drift vault capacity exceeded")]
VaultCapacityExceeded,
#[msg("Oracle price data is stale")]
StaleOracle,
#[msg("Insufficient liquid USDC in vault for withdrawal")]
InsufficientLiquidity,
#[msg("Drift CPI failed")]
DriftCpiFailed,
#[msg("Deposit exceeds vault cap")]
DepositCapExceeded,
```

- [ ] **Step 2: Add deposit_cap to RiskVault in state.rs**

Add field to `RiskVault` struct after `redemption_period_slots`:

```rust
pub deposit_cap: u64,
```

- [ ] **Step 3: Fix burn authority in withdraw instruction (lib.rs)**

In the `withdraw` function, change the burn CPI from allocator PDA to user. **Two changes required:** (a) change `authority` from `allocator` to `user`, (b) change `CpiContext::new_with_signer(..., signer_seeds)` to `CpiContext::new(...)` — user is already a transaction signer, no PDA signing needed for burn.

```rust
// BEFORE (lines 331-342 of lib.rs):
// token::burn(CpiContext::new_with_signer(..., Burn {
//   authority: ctx.accounts.allocator.to_account_info(),
// }, signer_seeds), shares)?;

// AFTER:
token::burn(
  CpiContext::new(
    ctx.accounts.token_program.to_account_info(),
    Burn {
      mint: ctx.accounts.share_mint.to_account_info(),
      from: ctx.accounts.user_shares.to_account_info(),
      authority: ctx.accounts.user.to_account_info(), // User signs the tx
    },
  ),
  shares,
)?;
```

> **Important:** Remove `signer_seeds` from the burn CPI entirely. The allocator PDA signer_seeds are still needed for the USDC transfers (vault_usdc → user, vault_usdc → treasury) but NOT for the burn.

- [ ] **Step 4: Add deposit cap check in deposit instruction**

In the `deposit` function, after the halted check, add:

```rust
let vault = &ctx.accounts.risk_vault;
if vault.deposit_cap > 0 {
  require!(
    vault.total_assets
      .checked_add(amount)
      .ok_or(AllocatorError::MathOverflow)?
      <= vault.deposit_cap,
    AllocatorError::DepositCapExceeded
  );
}
```

- [ ] **Step 5: Add deposit_cap parameter to initialize_risk_vault**

Add `deposit_cap: u64` parameter to `initialize_risk_vault` and set `vault.deposit_cap = deposit_cap;`

> **Schema note:** Adding `deposit_cap: u64` changes account size by 8 bytes. Fresh deploy only — existing devnet vaults (if any) must be re-initialized. Safe for current phase since allocator hasn't been deployed yet.

- [ ] **Step 5b: Add update_deposit_cap instruction**

Required for cap progression (seed $100 → limited $1,000 → open $10,000) without redeployment:

```rust
pub fn update_deposit_cap(ctx: Context<UpdateDepositCap>, new_cap: u64) -> Result<()> {
  let vault = &mut ctx.accounts.risk_vault;
  vault.deposit_cap = new_cap;
  Ok(())
}

#[derive(Accounts)]
pub struct UpdateDepositCap<'info> {
  #[account(seeds = [b"allocator"], bump = allocator.bump)]
  pub allocator: Account<'info, Allocator>,
  #[account(
    mut,
    constraint = risk_vault.allocator == allocator.key(),
  )]
  pub risk_vault: Account<'info, RiskVault>,
  #[account(constraint = admin.key() == allocator.admin @ AllocatorError::UnauthorizedAdmin)]
  pub admin: Signer<'info>,
}
```

- [ ] **Step 6: Scaffold allocate_to_drift instruction**

Add to lib.rs:

```rust
pub fn allocate_to_drift(ctx: Context<AllocateToDrift>, amount: u64) -> Result<()> {
  let allocator = &ctx.accounts.allocator;
  require!(!allocator.halted, AllocatorError::AllocatorHalted);
  require!(
    ctx.accounts.vault_usdc.amount >= amount,
    AllocatorError::InsufficientBalance
  );

  // TODO: CPI into Drift Vault program (added in Task 8 after devnet verification)
  // For now, transfer from vault_usdc to a drift_deposit_usdc account
  let allocator_bump = allocator.bump;
  let signer_seeds: &[&[&[u8]]] = &[&[b"allocator".as_ref(), &[allocator_bump]]];

  token::transfer(
    CpiContext::new_with_signer(
      ctx.accounts.token_program.to_account_info(),
      Transfer {
        from: ctx.accounts.vault_usdc.to_account_info(),
        to: ctx.accounts.drift_usdc.to_account_info(),
        authority: ctx.accounts.allocator.to_account_info(),
      },
      signer_seeds,
    ),
    amount,
  )?;

  Ok(())
}
```

- [ ] **Step 7: Scaffold recall_from_drift instruction**

Similar pattern — transfers from drift_usdc back to vault_usdc.

- [ ] **Step 8: Add account structs for new instructions**

```rust
#[derive(Accounts)]
pub struct AllocateToDrift<'info> {
  #[account(mut, seeds = [b"allocator"], bump = allocator.bump)]
  pub allocator: Account<'info, Allocator>,
  #[account(mut, constraint = risk_vault.allocator == allocator.key())]
  pub risk_vault: Account<'info, RiskVault>,
  #[account(constraint = keeper.key() == allocator.keeper_authority @ AllocatorError::UnauthorizedKeeper)]
  pub keeper: Signer<'info>,
  #[account(mut)]
  pub vault_usdc: Account<'info, TokenAccount>,
  #[account(mut)]
  pub drift_usdc: Account<'info, TokenAccount>,
  pub token_program: Program<'info, Token>,
}
```

> **Note:** The `allocate_to_drift` and `recall_from_drift` instructions are scaffolded here with simple SPL token transfers (vault_usdc ↔ drift_usdc). The actual Drift Vault CPI is wired in **Task 7b** below after Drift vault accounts are verified on devnet.
```

- [ ] **Step 9: Build and verify**

Run: `cd ~/local-dev/nanuqfi && anchor build`
Expected: Builds clean with no errors

- [ ] **Step 10: Commit**

```bash
cd ~/local-dev/nanuqfi
git add programs/allocator/
git commit -m "feat(allocator): add deposit cap, fix burn authority, scaffold Drift CPI instructions"
```

---

### Task 4: Deploy Infrastructure

**Files:**
- VPS: Create `nanuqfi` user on reclabs3
- Create: `~/local-dev/nanuqfi-keeper/docker-compose.yml`
- Create: `~/local-dev/nanuqfi-keeper/.github/workflows/deploy.yml`
- Create: `~/local-dev/nanuqfi-app/Dockerfile`
- Create: `~/local-dev/nanuqfi-app/docker-compose.yml`
- Create: `~/local-dev/nanuqfi-app/.github/workflows/deploy.yml`
- Create: `~/local-dev/nanuqfi/.github/workflows/ci.yml`
- Modify: `~/.ssh/config` — add nanuqfi host alias
- Modify: `~/.ssh/vps-port-registry.md` — reserve ports 9000-9001

**Context:** Set up deploy infrastructure in parallel with Drift integration. VPS user, Docker, CI/CD, DNS. Follows existing VPS deploy patterns from other projects (see `/vps-deploy` skill).

- [ ] **Step 1: Create VPS user**

```bash
ssh reclabs3 "adduser --disabled-password --gecos 'NanuqFi' nanuqfi && usermod -aG docker nanuqfi"
ssh reclabs3 "mkdir -p /home/nanuqfi/.ssh && cp /root/.ssh/authorized_keys /home/nanuqfi/.ssh/ && chown -R nanuqfi:nanuqfi /home/nanuqfi/.ssh && chmod 700 /home/nanuqfi/.ssh && chmod 600 /home/nanuqfi/.ssh/authorized_keys"
```

- [ ] **Step 2: Copy GHCR auth**

```bash
ssh reclabs3 "mkdir -p /home/nanuqfi/.docker && cp /home/core/.docker/config.json /home/nanuqfi/.docker/ && chown -R nanuqfi:nanuqfi /home/nanuqfi/.docker"
```

- [ ] **Step 3: Add SSH config entry**

Add to `~/.ssh/config`:

```
Host nanuqfi
  HostName 151.245.137.75
  User nanuqfi
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
```

- [ ] **Step 4: Update port registry**

Add to `~/.ssh/vps-port-registry.md`:

```markdown
### NanuqFi Project (user: nanuqfi)
- **9000** - nanuqfi-keeper (REST API - keeper.nanuqfi.xyz)
- **9001** - nanuqfi-app (Next.js frontend - app.nanuqfi.xyz)
```

- [ ] **Step 5: Verify SSH access**

```bash
ssh nanuqfi "whoami && docker ps --format '{{.Names}}'"
```
Expected: `nanuqfi` and empty container list

- [ ] **Step 6: Create keeper docker-compose.yml**

```yaml
# ~/local-dev/nanuqfi-keeper/docker-compose.yml
name: nanuqfi-keeper

services:
  keeper:
    image: ghcr.io/nanuqfi/nanuqfi-keeper:latest
    container_name: nanuqfi-keeper
    restart: unless-stopped
    ports:
      - "9000:3000"
    env_file:
      - .env
    volumes:
      - /home/nanuqfi/secrets/keeper-wallet.json:/run/secrets/keeper-wallet:ro
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 60s
      timeout: 10s
      retries: 3
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

- [ ] **Step 7: Create keeper deploy workflow**

```yaml
# ~/local-dev/nanuqfi-keeper/.github/workflows/deploy.yml
name: Deploy Keeper
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
      - run: pnpm build
      - run: pnpm lint

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ghcr.io/nanuqfi/nanuqfi-keeper
      - uses: docker/build-push-action@v6
        with:
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
      - uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd ${{ secrets.VPS_APP_PATH }}
            docker compose pull
            docker compose up -d
            docker image prune -f
```

- [ ] **Step 8: Create frontend Dockerfile**

```dockerfile
# ~/local-dev/nanuqfi-app/Dockerfile
FROM node:22-slim AS base
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 9: Create frontend docker-compose.yml and deploy workflow**

Same patterns as keeper — port 9001, `ghcr.io/nanuqfi/nanuqfi-app`.

- [ ] **Step 10: Create core monorepo CI workflow**

```yaml
# ~/local-dev/nanuqfi/.github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo test
      - run: pnpm turbo lint

  anchor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: coral-xyz/anchor-action@v0.30.1
      - run: anchor build
```

- [ ] **Step 11: Commit all deploy infrastructure**

```bash
# Commit in each repo separately
cd ~/local-dev/nanuqfi && git add .github/ && git commit -m "chore: add CI workflow"
cd ~/local-dev/nanuqfi-keeper && git add docker-compose.yml .github/ && git commit -m "chore: add Docker compose and deploy workflow"
cd ~/local-dev/nanuqfi-app && git add Dockerfile docker-compose.yml .github/ && git commit -m "chore: add Dockerfile, Docker compose, and deploy workflow"
```

---

## Chunk 2: Vertical Proof — Lending E2E (Days 3-7)

### Task 5: DriftLendingBackend Real Mode

**Files:**
- Modify: `packages/backend-drift/src/backends/lending.ts`
- Modify: `packages/backend-drift/src/backends/lending.test.ts`

**Context:** Add real mode to the lending backend. When `mockMode: false` and `driftClient` is provided, methods call real Drift SDK. Mock tests stay green. Pattern established here is reused for Tasks 12-14 (other backends).

- [ ] **Step 1: Write test for real mode constructor acceptance**

Add to `lending.test.ts`:

```typescript
describe('DriftLendingBackend real mode', () => {
  it('accepts driftClient in constructor', () => {
    // In unit tests, we pass a mock DriftClient
    const mockDriftClient = {} as any
    const backend = new DriftLendingBackend({
      mockMode: false,
      driftClient: mockDriftClient,
    })
    expect(backend.name).toBe('drift-lending')
  })

  it('throws if real mode without driftClient', async () => {
    const backend = new DriftLendingBackend({ mockMode: false })
    await expect(backend.getExpectedYield()).rejects.toThrow('DriftClient required')
  })
})
```

- [ ] **Step 2: Run test — verify fails**

- [ ] **Step 3: Implement real mode in lending backend**

Update `DriftLendingConfig` and constructor:

```typescript
import { DriftClient } from '@drift-labs/sdk'
import { toBN, fromBN } from '../utils/bn-convert'
import { fetchDepositRate } from '../utils/drift-data-api'

export interface DriftLendingConfig {
  mockMode?: boolean
  mockApy?: number
  mockVolatility?: number
  driftClient?: DriftClient  // NEW
}
```

**Constructor change:** The existing constructor stores only mock fields as `Required<DriftLendingConfig>`, which drops `driftClient`. Fix by storing driftClient separately:

```typescript
private readonly mockConfig: { mockMode: boolean; mockApy: number; mockVolatility: number }
private readonly driftClient?: DriftClient

constructor(config: DriftLendingConfig = {}) {
  this.mockConfig = {
    mockMode: config.mockMode ?? false,
    mockApy: config.mockApy ?? 0.08,
    mockVolatility: config.mockVolatility ?? 0.05,
  }
  this.driftClient = config.driftClient
}

private get isMockMode(): boolean {
  return this.mockConfig.mockMode
}
```

Update each method to check `isMockMode` first (existing), then use `driftClient` for real mode. Example for `getExpectedYield`:

```typescript
async getExpectedYield(): Promise<YieldEstimate> {
  if (this.config.mockMode) {
    return { /* existing mock implementation */ }
  }
  if (!this.config.driftClient) {
    throw new Error('DriftClient required for real mode')
  }
  const rate = await fetchDepositRate(0) // USDC = market 0
  return {
    annualizedApy: rate,
    source: this.name,
    asset: 'USDC',
    confidence: 0.92,
    timestamp: Date.now(),
    metadata: { mode: 'real' },
  }
}
```

Pattern for `deposit`:

```typescript
async deposit(amount: bigint, _params?: Record<string, unknown>): Promise<TxSignature> {
  if (this.config.mockMode) {
    return `mock-tx-drift-lending-deposit-${Date.now()}`
  }
  if (!this.config.driftClient) throw new Error('DriftClient required for real mode')

  const dc = this.config.driftClient
  const marketIndex = 0 // USDC
  const bnAmount = dc.convertToSpotPrecision(marketIndex, Number(amount) / 1e6)
  const ata = await dc.getAssociatedTokenAccount(marketIndex)
  const txSig = await dc.deposit(bnAmount, marketIndex, ata)
  return txSig
}
```

- [ ] **Step 4: Run all tests (existing mock + new real mode)**

Run: `cd ~/local-dev/nanuqfi && pnpm turbo test --filter=@nanuqfi/backend-drift`
Expected: All 43 existing tests PASS + new tests PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(backend-drift): add real mode to DriftLendingBackend"
```

---

### Task 6: Deploy Allocator to Devnet

**Files:**
- Modify: `Anchor.toml` (devnet config)
- Create: `scripts/setup-drift-vaults.ts`

**Context:** Deploy the allocator program to Solana devnet. Create Drift vaults for moderate and aggressive tiers. Set up the keeper as trading delegate.

- [ ] **Step 1: Configure Anchor.toml for devnet**

Verify `[provider]` section has devnet cluster and wallet path.

- [ ] **Step 2: Deploy to devnet**

```bash
cd ~/local-dev/nanuqfi
anchor deploy --provider.cluster devnet
```

Expected: Program deployed, verify with `solana program show 2QtJ5kmxLuW2jYCFpJMtzZ7PCnKdoMwkeueYoDUi5z5P --url devnet`

- [ ] **Step 3: Write Drift vault setup script**

```typescript
// scripts/setup-drift-vaults.ts
// One-time script to:
// 1. Initialize allocator
// 2. Initialize treasury
// 3. Initialize moderate vault (risk_level=1, deposit_cap=$100)
// 4. Initialize aggressive vault (risk_level=2, deposit_cap=$100)
// 5. Create Drift vaults with allocator PDA as manager
// 6. Set keeper as trading delegate on each Drift vault
```

- [ ] **Step 4: Run setup script on devnet**

```bash
npx tsx scripts/setup-drift-vaults.ts --cluster devnet
```

- [ ] **Step 5: Verify on-chain state**

```bash
# Verify allocator account exists
solana account <ALLOCATOR_PDA> --url devnet
# Verify risk vault accounts
solana account <MODERATE_VAULT_PDA> --url devnet
solana account <AGGRESSIVE_VAULT_PDA> --url devnet
```

- [ ] **Step 6: Commit**

```bash
git add scripts/ Anchor.toml
git commit -m "feat: deploy allocator to devnet with vault setup script"
```

---

### Task 7: Lending Integration Test on Devnet

**Files:**
- Create: `packages/backend-drift/tests/integration/lending.int.test.ts`
- Modify: `packages/backend-drift/package.json` (add test:integration script)

**Context:** End-to-end test of DriftLendingBackend real mode on devnet. Deposits USDC, verifies position, withdraws, verifies cleanup. Uses shared devnet wallet (`~/Documents/secret/solana-devnet.json`).

- [ ] **Step 1: Add integration test script to package.json**

```json
"test:integration": "vitest run tests/integration/ --timeout 30000"
```

- [ ] **Step 2: Write lending integration test**

```typescript
// packages/backend-drift/tests/integration/lending.int.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DriftLendingBackend } from '../../src/backends/lending'
import { createDriftConnection } from '../../src/drift-connection'
import type { DriftClient } from '@drift-labs/sdk'

describe('DriftLendingBackend integration (devnet)', () => {
  let driftClient: DriftClient
  let backend: DriftLendingBackend

  beforeAll(async () => {
    driftClient = await createDriftConnection({
      rpcUrl: process.env.DEVNET_RPC_URL ?? 'https://api.devnet.solana.com',
      walletKeypairPath: process.env.WALLET_PATH ?? `${process.env.HOME}/Documents/secret/solana-devnet.json`,
      env: 'devnet',
    })
    backend = new DriftLendingBackend({ mockMode: false, driftClient })
  }, 30_000)

  afterAll(async () => {
    if (driftClient) await driftClient.unsubscribe()
  })

  it('fetches real lending rate', async () => {
    const yield_ = await backend.getExpectedYield()
    expect(yield_.annualizedApy).toBeGreaterThan(0)
    expect(yield_.source).toBe('drift-lending')
    expect(yield_.metadata?.mode).toBe('real')
  }, 10_000)

  it('fetches real risk metrics', async () => {
    const risk = await backend.getRisk()
    expect(risk.volatilityScore).toBeGreaterThanOrEqual(0)
    expect(risk.liquidationRisk).toBe('none')
  }, 10_000)

  it('gets position state', async () => {
    const position = await backend.getPosition()
    expect(position.backend).toBe('drift-lending')
    expect(position.asset).toBe('USDC')
  }, 10_000)
})
```

- [ ] **Step 3: Run integration test**

Run: `cd ~/local-dev/nanuqfi/packages/backend-drift && pnpm test:integration`
Expected: PASS (real devnet data)

- [ ] **Step 4: Commit**

```bash
git add packages/backend-drift/tests/integration/ packages/backend-drift/package.json
git commit -m "test(backend-drift): add lending integration test on devnet"
```

---

### Task 7b: Wire Drift Vault CPI into Allocator

**Files:**
- Modify: `programs/allocator/src/lib.rs` (replace scaffold with real Drift CPI)
- Modify: `programs/allocator/Cargo.toml` (add drift-vaults dependency)

**Context:** Task 3 scaffolded `allocate_to_drift` / `recall_from_drift` with simple SPL token transfers. Now that Drift vaults are created on devnet (Task 6), wire the actual CPI. This requires the Drift Vault program ID and account structures.

- [ ] **Step 1: Research Drift Vault program accounts on devnet**

Use `solana account` to inspect the Drift vault created in Task 6. Identify the exact accounts needed for the deposit/withdraw CPI.

- [ ] **Step 2: Add Drift Vault program ID to lib.rs**

```rust
// Drift Vault Program ID (same on devnet and mainnet)
const DRIFT_VAULT_PROGRAM: Pubkey = pubkey!("vAuLTQjV5AoNUySBCw8szTFTpKhHhBMo6prcBhnPmiu");
```

- [ ] **Step 3: Update AllocateToDrift to use Drift Vault CPI**

Replace the simple token transfer with CPI into Drift Vault's `manager_deposit` instruction. The allocator PDA signs as vault manager:

```rust
// Replace the scaffolded transfer with:
// 1. Build Drift Vault deposit CPI accounts
// 2. CPI into Drift Vault program with allocator PDA as signer (vault manager)
// 3. Transfer flows: vault_usdc → Drift Vault USDC account
```

Required additional accounts in `AllocateToDrift`:
- `drift_vault: AccountInfo` — the Drift vault account
- `drift_vault_token_account: Account<TokenAccount>` — Drift vault's USDC
- `drift_vault_program: Program` — Drift Vault program
- `drift_state: AccountInfo` — Drift protocol state (for CPI chain)

- [ ] **Step 4: Update RecallFromDrift similarly**

CPI into Drift Vault's `manager_request_withdraw` / `manager_withdraw`.

- [ ] **Step 5: Build and test on devnet**

```bash
anchor build && anchor deploy --provider.cluster devnet
```

Then test:
```bash
npx tsx scripts/test-cpi.ts --cluster devnet
# Script: allocate_to_drift 1 USDC, verify Drift vault balance increases
# Script: recall_from_drift 1 USDC, verify vault_usdc balance increases
```

- [ ] **Step 6: Commit**

```bash
git add programs/allocator/
git commit -m "feat(allocator): wire real Drift Vault CPI for allocate/recall instructions"
```

---

## Chunk 3: Strategy Expansion (Days 8-14)

### Task 8: DriftBasisTradeBackend Real Mode

**Files:**
- Modify: `packages/backend-drift/src/backends/basis-trade.ts`
- Create: `packages/backend-drift/tests/integration/basis-trade.int.test.ts`

**Context:** Paired positions (spot collateral + perp short). Most complex backend after JitoSOL. Follow Task 5 dual-mode pattern: `driftClient?: DriftClient` in config, separate storage, mock path untouched.

- [ ] **Step 1: Update config and constructor** (same pattern as Task 5)

- [ ] **Step 2: Implement real deposit (two-leg atomic)**

```typescript
async deposit(amount: bigint, params?: Record<string, unknown>): Promise<TxSignature> {
  if (this.isMockMode) return `mock-tx-drift-basis-deposit-${Date.now()}`
  if (!this.driftClient) throw new Error('DriftClient required for real mode')

  const dc = this.driftClient
  const marketIndex = params?.marketIndex as number ?? 0 // SOL-PERP default

  // Leg 1: Deposit USDC as collateral
  const usdcMarketIndex = 0
  const bnAmount = dc.convertToSpotPrecision(usdcMarketIndex, Number(amount) / 1e6)
  const ata = await dc.getAssociatedTokenAccount(usdcMarketIndex)
  await dc.deposit(bnAmount, usdcMarketIndex, ata)

  // Leg 2: Open perp short (delta-neutral hedge)
  try {
    const makers = await this.fetchTopMakers(marketIndex, 'bid')
    const txSig = await dc.placeAndTakePerpOrder(
      {
        direction: PositionDirection.SHORT,
        baseAssetAmount: this.calculateHedgeSize(amount, marketIndex),
        marketIndex,
        marketType: MarketType.PERP,
        orderType: OrderType.MARKET,
      },
      makers.map(m => ({ maker: m.userAccountPubKey, makerUserAccount: m.userAccount, makerStats: getUserStatsAccountPublicKey(dc.program.programId, m.userAccount.authority) })),
    )
    return txSig
  } catch (err) {
    // Leg 2 failed — unwind Leg 1 immediately
    await dc.withdraw(bnAmount, usdcMarketIndex, ata)
    throw new Error(`Basis trade deposit failed on perp leg, collateral unwound: ${err}`)
  }
}
```

- [ ] **Step 3: Implement real getExpectedYield using funding rates**

```typescript
async getExpectedYield(): Promise<YieldEstimate> {
  if (this.isMockMode) { /* existing */ }
  const rates = await fetchFundingRates('SOL-PERP')
  if (rates.length === 0) return { annualizedApy: 0, source: this.name, asset: 'USDC', confidence: 0.5, timestamp: Date.now(), metadata: { mode: 'real' } }
  const latest = parseFundingRate(rates[rates.length - 1])
  return { annualizedApy: latest.annualizedApr / 100, source: this.name, asset: 'USDC', confidence: 0.80, timestamp: Date.now(), metadata: { mode: 'real', fundingRate: latest.hourlyRate } }
}
```

- [ ] **Step 4: Implement real shouldAutoExit with real funding history**

Existing logic works unchanged — just pass real `fundingHistory` from Data API.

- [ ] **Step 5: Write unit tests for real mode constructor + mock mode preserved**

- [ ] **Step 6: Run all tests (43 existing + new)**

- [ ] **Step 7: Write integration test on devnet**

```typescript
// tests/integration/basis-trade.int.test.ts — same structure as lending.int.test.ts
// Test: getExpectedYield returns real funding rate > 0
// Test: shouldAutoExit with real funding data returns boolean
// Test: getPosition returns real state
// NOTE: Don't test deposit/withdraw in integration — requires funded devnet account + open positions
```

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(backend-drift): add real mode to DriftBasisTradeBackend with atomic paired positions"
```

---

### Task 9: DriftFundingBackend Real Mode

**Files:**
- Modify: `packages/backend-drift/src/backends/funding.ts`
- Create: `packages/backend-drift/tests/integration/funding.int.test.ts`

**Context:** Directional perp positions — simpler than basis (one-leg, no spot collateral). Same dual-mode pattern as Tasks 5 and 8.

- [ ] **Step 1: Update config and constructor** (Task 5 pattern)

- [ ] **Step 2: Implement real deposit**

Single-leg perp: deposit USDC collateral + open directional perp position. Direction determined by funding rate sign (long if funding positive, short if negative).

```typescript
// deposit: driftClient.deposit(collateral) + driftClient.placeAndTakePerpOrder(direction based on params.direction)
```

- [ ] **Step 3: Implement real getExpectedYield** (real funding rates from Data API)

- [ ] **Step 4: Implement real shouldAutoExit** (real PnL from `getUser().getPerpPosition().getUnrealizedPnl()`)

- [ ] **Step 5: Run all tests, write integration test, commit**

```bash
git commit -m "feat(backend-drift): add real mode to DriftFundingBackend"
```

---

### Task 10: DriftJitoDNBackend Real Mode

**Files:**
- Modify: `packages/backend-drift/src/backends/jito-dn.ts`
- Create: `packages/backend-drift/src/utils/jupiter.ts`
- Create: `packages/backend-drift/tests/integration/jito-dn.int.test.ts`
- Modify: `packages/backend-drift/package.json` (add @jup-ag/api if needed)

**Context:** Most complex backend. Three legs: Jupiter swap (USDC → JitoSOL), Drift spot deposit (JitoSOL), Drift perp short (hedge). New external dependency: Jupiter API.

- [ ] **Step 1: Create Jupiter swap client**

```typescript
// packages/backend-drift/src/utils/jupiter.ts
const JUPITER_API = 'https://quote-api.jup.ag/v6'

export interface SwapResult {
  txSignature: string
  inputAmount: bigint
  outputAmount: bigint
}

export async function swapUsdcToJitoSol(
  connection: Connection,
  wallet: Keypair,
  usdcAmount: bigint,
): Promise<SwapResult> {
  // 1. Get quote: USDC → JitoSOL
  const quoteRes = await fetch(`${JUPITER_API}/quote?inputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&outputMint=J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn&amount=${usdcAmount}&slippageBps=50`)
  const quote = await quoteRes.json()
  // 2. Get swap transaction
  const swapRes = await fetch(`${JUPITER_API}/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quoteResponse: quote, userPublicKey: wallet.publicKey.toBase58() }),
  })
  const { swapTransaction } = await swapRes.json()
  // 3. Deserialize, sign, send
  // ... standard Solana tx signing flow
}

export async function swapJitoSolToUsdc(
  connection: Connection,
  wallet: Keypair,
  jitoSolAmount: bigint,
): Promise<SwapResult> {
  // Reverse of above: JitoSOL → USDC
}
```

- [ ] **Step 2: Implement real deposit (three-leg)**

```typescript
async deposit(amount: bigint, params?: Record<string, unknown>): Promise<TxSignature> {
  if (this.isMockMode) return `mock-tx-drift-jito-dn-deposit-${Date.now()}`
  if (!this.driftClient) throw new Error('DriftClient required for real mode')

  // Leg 1: Jupiter swap USDC → JitoSOL (off-chain, keeper wallet)
  const swapResult = await swapUsdcToJitoSol(this.driftClient.connection, this.driftClient.wallet.payer, amount)

  // Leg 2: Deposit JitoSOL into Drift spot
  try {
    const jitoSolMarketIndex = 6 // JitoSOL spot market on Drift
    await this.driftClient.deposit(toBN(swapResult.outputAmount), jitoSolMarketIndex, /* jitoSol ATA */)
  } catch (err) {
    // Leg 2 failed — swap JitoSOL back to USDC
    await swapJitoSolToUsdc(this.driftClient.connection, this.driftClient.wallet.payer, swapResult.outputAmount)
    throw new Error(`JitoSOL DN deposit failed on Drift deposit leg: ${err}`)
  }

  // Leg 3: Open SOL perp short as hedge
  try {
    const txSig = await this.driftClient.placeAndTakePerpOrder(/* SOL-PERP SHORT */)
    return txSig
  } catch (err) {
    // Leg 3 failed — withdraw JitoSOL from Drift, swap back
    // ... full unwind
    throw new Error(`JitoSOL DN deposit failed on hedge leg: ${err}`)
  }
}
```

- [ ] **Step 3: Implement real getExpectedYield**

```typescript
// yield = JitoSOL staking yield (Jito API) - SOL borrow rate (Drift Data API)
const jitoYield = await fetchJitoStakingYield() // New: fetch from Jito API
const solBorrowRate = await fetchBorrowRate(1)   // SOL = market index 1
return { annualizedApy: jitoYield - solBorrowRate, ... }
```

- [ ] **Step 4: Implement real shouldAutoExit** (existing logic, real rates)

- [ ] **Step 5: Run all tests, write integration test, commit**

```bash
git commit -m "feat(backend-drift): add real mode to DriftJitoDNBackend with Jupiter swap"
```

---

### Task 11: Keeper Real Drift Integration

**Files:**
- Create: `~/local-dev/nanuqfi-keeper/src/drift/client.ts`
- Create: `~/local-dev/nanuqfi-keeper/src/drift/data-api.ts`
- Create: `~/local-dev/nanuqfi-keeper/src/drift/trading.ts`
- Modify: `~/local-dev/nanuqfi-keeper/src/config.ts`
- Modify: `~/local-dev/nanuqfi-keeper/src/keeper.ts`

**Context:** Wire the keeper to real Drift. The keeper already has the algorithm engine, auto-exit, and AI layer — this task replaces mock data with real Drift feeds and enables real transaction submission.

- [ ] **Step 1: Create keeper DriftClient wrapper**

```typescript
// src/drift/client.ts
// Wraps createDriftConnection from @nanuqfi/backend-drift
// Adds: health check (isSubscribed), reconnect logic, subscription verification
// Used by keeper.ts during boot sequence
```

- [ ] **Step 2: Create keeper Data API client**

```typescript
// src/drift/data-api.ts
// Re-exports from @nanuqfi/backend-drift/utils/drift-data-api
// Adds: caching with TTL (5 min), fallback to last-known values
// Adds: rate conversion helpers specific to keeper needs
```

- [ ] **Step 3: Create trading delegate operations**

```typescript
// src/drift/trading.ts
// Functions for keeper as trading delegate:
// - openPerpPosition(driftClient, marketIndex, direction, size)
// - closePerpPosition(driftClient, marketIndex)
// - getPositionPnl(driftClient, marketIndex)
// Each with simulation before send, retry logic, priority fees
```

- [ ] **Step 4: Update keeper config**

Add Drift connection config to `src/config.ts`:

```typescript
export interface KeeperConfig {
  // ... existing fields
  drift: {
    rpcUrl: string
    rpcFallbackUrl?: string
    walletKeypairPath: string
    env: 'devnet' | 'mainnet-beta'
  }
  jupiter?: {
    apiUrl: string  // default: https://quote-api.jup.ag/v6
  }
}
```

- [ ] **Step 5: Wire DriftClient into keeper boot sequence**

Update `src/keeper.ts`:
1. Boot: create DriftClient, subscribe
2. Inject into backends (mockMode: false, driftClient)
3. Verify subscription healthy before each cycle
4. Use real data feeds in algorithm engine
5. Submit real transactions as trading delegate

- [ ] **Step 6: Run existing 140 keeper tests (mock mode must still pass)**

Run: `cd ~/local-dev/nanuqfi-keeper && pnpm test`
Expected: 140 PASS — mock mode untouched

- [ ] **Step 7: Create keeper integration test**

```typescript
// tests/integration/keeper-cycle.int.test.ts
// Test one full keeper cycle on devnet with real data:
// 1. Boot with DriftClient
// 2. Fetch real rates
// 3. Run algorithm engine
// 4. Verify decision logged
// 5. Verify heartbeat written
```

- [ ] **Step 8: Commit**

```bash
cd ~/local-dev/nanuqfi-keeper
git add src/drift/ src/config.ts src/keeper.ts tests/integration/
git commit -m "feat: wire keeper to real Drift SDK with data feeds and trading"
```

---

## Chunk 4: Frontend Integration (Days 10-14, parallel with Chunk 3)

### Task 12: Wallet Adapter + Connection Provider

**Files:**
- Create: `~/local-dev/nanuqfi-app/src/providers/wallet-provider.tsx`
- Create: `~/local-dev/nanuqfi-app/src/providers/connection-provider.tsx`
- Modify: `~/local-dev/nanuqfi-app/src/app/layout.tsx`
- Modify: `~/local-dev/nanuqfi-app/package.json` (add wallet adapter deps)

**Context:** Add Solana wallet adapter (Phantom, Solflare, Backpack). Wraps the app at layout level.

- [ ] **Step 1: Install wallet adapter packages**

```bash
cd ~/local-dev/nanuqfi-app
pnpm add @solana/wallet-adapter-react @solana/wallet-adapter-wallets @solana/wallet-adapter-react-ui @solana/web3.js
```

- [ ] **Step 2: Create connection provider**

```tsx
// src/providers/connection-provider.tsx
'use client'
import { ConnectionProvider as SolanaConnectionProvider } from '@solana/wallet-adapter-react'

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://api.devnet.solana.com'

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  return (
    <SolanaConnectionProvider endpoint={RPC_URL}>
      {children}
    </SolanaConnectionProvider>
  )
}
```

- [ ] **Step 3: Create wallet provider**

```tsx
// src/providers/wallet-provider.tsx
'use client'
import { WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react'
import { PhantomWalletAdapter, SolflareWalletAdapter, BackpackWalletAdapter } from '@solana/wallet-adapter-wallets'
import { useMemo } from 'react'

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
    new BackpackWalletAdapter(),
  ], [])

  return (
    <SolanaWalletProvider wallets={wallets} autoConnect>
      {children}
    </SolanaWalletProvider>
  )
}
```

- [ ] **Step 4: Wrap layout.tsx with providers**

- [ ] **Step 5: Verify build passes**

```bash
pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add src/providers/ src/app/layout.tsx package.json pnpm-lock.yaml
git commit -m "feat: add Solana wallet adapter with Phantom, Solflare, Backpack"
```

---

### Task 13: On-Chain Data Hooks

**Files:**
- Create: `~/local-dev/nanuqfi-app/src/hooks/use-allocator.ts`
- Create: `~/local-dev/nanuqfi-app/src/hooks/use-keeper-api.ts`

**Context:** Custom hooks for reading on-chain allocator state (PDA accounts) and keeper REST API (APY, decisions). Polling-based with configurable intervals.

- [ ] **Step 1: Create allocator hooks**

```typescript
// src/hooks/use-allocator.ts
// Hooks:
// - useAllocator() — reads Allocator PDA (TVL, halted status)
// - useRiskVault(riskLevel) — reads RiskVault PDA (TVL, shares, price)
// - useUserPosition(riskLevel) — reads UserPosition PDA (shares, pending withdrawal)
// - useUsdcBalance() — reads connected wallet's USDC token balance
// All use useConnection() + useWallet() from adapter, poll every 15s
```

- [ ] **Step 2: Create keeper API hooks**

```typescript
// src/hooks/use-keeper-api.ts
// Hooks:
// - useKeeperHealth() — GET /health, poll 30s
// - useVaultData(riskLevel) — GET /vaults/:riskLevel, poll 30s
// - useVaultHistory(riskLevel) — GET /vaults/:riskLevel/history, paginated
// - useKeeperDecisions(riskLevel) — GET /vaults/:riskLevel/decisions
// - useYieldEstimates() — GET /yields
// All with error handling: if keeper unreachable, return stale data + isStale flag
```

- [ ] **Step 3: Commit**

---

### Task 14: Transaction Builders + Error Mapping

**Files:**
- Create: `~/local-dev/nanuqfi-app/src/lib/transactions.ts`
- Create: `~/local-dev/nanuqfi-app/src/lib/errors.ts`

**Context:** Build Anchor instructions for deposit, request_withdraw, withdraw. Map all allocator error codes to human-readable messages.

- [ ] **Step 1: Create transaction builders**

```typescript
// src/lib/transactions.ts
// Functions:
// - buildDepositTx(program, riskLevel, amount, userWallet) → Transaction
// - buildRequestWithdrawTx(program, riskLevel, shares, userWallet) → Transaction
// - buildWithdrawTx(program, riskLevel, userWallet) → Transaction
// Each derives correct PDAs, includes all required accounts
```

- [ ] **Step 2: Create error mapping**

```typescript
// src/lib/errors.ts
const ERROR_MAP: Record<number, string> = {
  6000: 'Weights must sum to 100%',
  6001: 'Weight exceeds maximum allocation',
  6002: 'Negative weight value',
  6003: 'Rebalance interval not met',
  6004: 'Allocation shift exceeds maximum per rebalance',
  6005: 'Unauthorized: not the keeper',
  6006: 'Unauthorized: not the admin',
  6007: 'Vault is currently halted — deposits paused',
  6008: 'Drawdown exceeds maximum for this vault',
  6009: 'Oracle price divergence exceeds threshold',
  6010: 'Withdrawal not ready — redemption period not elapsed',
  6011: 'No pending withdrawal to complete',
  6012: 'Invalid risk level',
  6013: 'Vault already initialized',
  6014: 'Cannot loosen guardrails beyond initial values',
  6015: 'Keeper lease conflict — another instance is active',
  6016: 'You already have a pending withdrawal',
  6017: 'Insufficient vault balance',
  6018: 'Arithmetic overflow',
  6019: 'Drift vault capacity exceeded',
  6020: 'Oracle price data is stale — try again',
  6021: 'Insufficient liquid USDC — keeper is freeing funds',
  6022: 'Drift operation failed — try again',
  6023: 'Deposit exceeds vault cap',
}

export function parseAllocatorError(error: unknown): string {
  // Extract Anchor error code from error object
  const code = extractErrorCode(error)
  if (code !== null && ERROR_MAP[code]) return ERROR_MAP[code]
  return 'Transaction failed. Please try again.'
}

function extractErrorCode(error: unknown): number | null {
  // Anchor errors: error.error.errorCode.number or error.logs containing 'Error Number: XXXX'
  if (typeof error === 'object' && error !== null) {
    const e = error as any
    if (e?.error?.errorCode?.number) return e.error.errorCode.number
  }
  return null
}
```

- [ ] **Step 3: Write tests for error mapping and transaction PDA derivation**

```typescript
// src/lib/__tests__/errors.test.ts
import { describe, it, expect } from 'vitest'
import { parseAllocatorError } from '../errors'

describe('parseAllocatorError', () => {
  it('maps known error code to message', () => {
    const error = { error: { errorCode: { number: 6007 } } }
    expect(parseAllocatorError(error)).toBe('Vault is currently halted — deposits paused')
  })

  it('returns fallback for unknown error', () => {
    expect(parseAllocatorError(new Error('random'))).toBe('Transaction failed. Please try again.')
  })

  it('handles null/undefined', () => {
    expect(parseAllocatorError(null)).toBe('Transaction failed. Please try again.')
  })
})
```

- [ ] **Step 4: Commit**

---

### Task 15: Wire Real Data Into Pages

**Files:**
- Modify: `~/local-dev/nanuqfi-app/src/app/page.tsx`
- Modify: `~/local-dev/nanuqfi-app/src/app/vaults/page.tsx`
- Modify: `~/local-dev/nanuqfi-app/src/app/vaults/[riskLevel]/page.tsx`
- Modify: `~/local-dev/nanuqfi-app/src/app/activity/page.tsx`

**Context:** Replace mock-data.ts imports with real hooks. Add deposit/withdraw UI flows to vault detail page. Add wallet connect button to nav. Add loading skeletons and error states.

- [ ] **Step 1: Update dashboard (page.tsx) with real TVL, APY**

Replace mock data with `useAllocator()` + `useKeeperHealth()`. Show skeleton while loading.

- [ ] **Step 2: Update vault list with real vault data**

Replace mock vaults with `useRiskVault('moderate')` + `useRiskVault('aggressive')`.

- [ ] **Step 3: Add deposit/withdraw to vault detail page**

Add deposit form: amount input → build tx → wallet sign → optimistic update.
Add withdrawal flow: request → countdown → complete.
Add all UI states from spec Section 6.

- [ ] **Step 4: Update activity page with real keeper decisions**

Replace mock decisions with `useKeeperDecisions()` + `useVaultHistory()`.

- [ ] **Step 5: Verify build**

```bash
pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "feat: wire all pages to real on-chain data and keeper API"
```

---

## Chunk 5: Deploy + Submission (Days 15-21)

### Task 16: DNS + Nginx + SSL

- [ ] **Step 1: Create DNS records** at domain registrar:
  - `app.nanuqfi.xyz` → A record → `151.245.137.75`
  - `keeper.nanuqfi.xyz` → A record → `151.245.137.75`

- [ ] **Step 2: Verify DNS resolves**

```bash
dig app.nanuqfi.xyz +short
dig keeper.nanuqfi.xyz +short
```
Expected: `151.245.137.75`

- [ ] **Step 3: Create nginx configs**

```bash
ssh reclabs3 "cat > /etc/nginx/sites-available/nanuqfi-keeper << 'EOF'
server {
    listen 80;
    server_name keeper.nanuqfi.xyz;
    location / {
        proxy_pass http://localhost:9000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF
ln -sf /etc/nginx/sites-available/nanuqfi-keeper /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx"
```

Same pattern for `nanuqfi-app` on port 9001.

- [ ] **Step 4: SSL certificates**

```bash
ssh reclabs3 "certbot --nginx -d keeper.nanuqfi.xyz -d app.nanuqfi.xyz"
```

---

### Task 17: Devnet E2E Gate

Run the 10-step pre-mainnet checklist from the spec:

- [ ] **Step 1:** Verify allocator deployed to devnet
- [ ] **Step 2:** Verify Drift vaults created (moderate + aggressive)
- [ ] **Step 3:** Verify keeper as trading delegate
- [ ] **Step 4:** Deposit 10 USDC into moderate vault → verify shares minted
- [ ] **Step 5:** Run keeper for 3 full cycles → verify decisions logged
- [ ] **Step 6:** Trigger auto-exit condition → verify keeper responds
- [ ] **Step 7:** Request withdrawal → wait redemption → complete withdrawal
- [ ] **Step 8:** Verify: USDC returned, fees correct, positions closed
- [ ] **Step 9:** Emergency halt → verify behavior
- [ ] **Step 10:** All pass → green light for mainnet

---

### Task 18: Mainnet Deploy

- [ ] **Step 1: Deploy allocator to mainnet**

```bash
anchor deploy --provider.cluster mainnet-beta
```

- [ ] **Step 2: Run setup script on mainnet**

Initialize allocator, treasury, 2 risk vaults with $100 deposit cap, create Drift vaults.

- [ ] **Step 3: Deploy keeper (mainnet env)**

Update env vars: `DRIFT_ENV=mainnet-beta`, RPC URLs. Push to main → CI/CD deploys.

- [ ] **Step 4: Deploy frontend (mainnet env)**

Update env vars: `NEXT_PUBLIC_RPC_URL`, program ID. Push to main → CI/CD deploys.

- [ ] **Step 5: Seed with own funds**

RECTOR deposits $50-100 into each vault via the frontend.

- [ ] **Step 6: Monitor 48 hours**

Verify keeper cycles, rebalances, transparency UI, all strategies execute.

---

### Task 19: Hackathon Submission

- [ ] **Step 1: Write strategy documentation**

Thesis, mechanics (4 strategies, 2 risk tiers), risk management (on-chain guardrails, auto-exit, AI reasoning).

- [ ] **Step 2: Record demo video (3 min max)**

Script: wallet connect → deposit → transparency UI → keeper decisions → on-chain guardrails → withdrawal.

- [ ] **Step 3: Submit on Superteam**

Upload: video, docs, GitHub links, on-chain vault addresses (Solscan).

---

## Quality Gates

| Gate | Condition | Blocks |
|------|-----------|--------|
| Chunk 1 → Chunk 2 | DriftClient connects to devnet, allocator deployed, VPS user created | All remaining chunks |
| Chunk 2 → Chunk 3 | Lending deposit/withdraw works on devnet, integration test passes | Strategy expansion |
| Chunk 3 → Chunk 5 | All 4 backends work on devnet, keeper runs 3+ cycles with real data | Mainnet deploy |
| Chunk 4 → Chunk 5 | Frontend builds, wallet connects, deposit/withdraw UI works on devnet | Mainnet deploy |
| Chunk 5 (E2E gate) | All 10 pre-mainnet checks pass | Mainnet deploy |
