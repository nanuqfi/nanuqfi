# P0-Critical Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 5 P0-critical security/correctness issues across the NanuqFi ecosystem (3 repos).

**Architecture:** Three independent `fix/p0-critical-hardening` branches — one per repo. Each fix includes a verification test. Issues: #29, #30 (core), #21, #22 (app), #9 (keeper).

**Tech Stack:** Rust/Anchor 0.30.1, TypeScript, Next.js 16, Vitest, @solana/web3.js

---

## Task 1: Fix #29 — Remove devnet from default Cargo features

**Repo:** `nanuqfi/nanuqfi` (`~/local-dev/nanuqfi/`)

**Files:**
- Modify: `programs/allocator/Cargo.toml` (features section)

- [ ] **Step 1: Create branch**

```bash
cd ~/local-dev/nanuqfi
git checkout -b fix/p0-critical-hardening
```

- [ ] **Step 2: Change default features**

In `programs/allocator/Cargo.toml`, change:

```toml
# BEFORE
default = ["devnet"]

# AFTER
default = []
```

- [ ] **Step 3: Verify mainnet build compiles without devnet instructions**

```bash
cd ~/local-dev/nanuqfi
cargo build-sbf --manifest-path programs/allocator/Cargo.toml 2>&1 | head -5
```

Expected: Build succeeds. The `admin_reset_vault`, `admin_set_tvl`, `admin_set_rebalance_counter` instructions are excluded.

- [ ] **Step 4: Verify devnet build still compiles with devnet feature flag**

```bash
cd ~/local-dev/nanuqfi
cargo build-sbf --manifest-path programs/allocator/Cargo.toml --features devnet 2>&1 | head -5
```

Expected: Build succeeds with all instructions including devnet admin ones.

- [ ] **Step 5: Verify Rust tests pass with devnet feature**

```bash
cd ~/local-dev/nanuqfi
cargo test --manifest-path programs/allocator/Cargo.toml --features devnet
```

Expected: All 98 Rust tests pass.

- [ ] **Step 6: Commit**

```bash
cd ~/local-dev/nanuqfi
git add programs/allocator/Cargo.toml
git commit -m "fix(program): remove devnet from default Cargo features

Devnet admin instructions (admin_reset_vault, admin_set_tvl,
admin_set_rebalance_counter) were compiling into mainnet builds.
Now require explicit --features devnet flag.

Closes #29"
```

---

## Task 2: Fix #30 — Add token mint/authority constraints

**Repo:** `nanuqfi/nanuqfi` (`~/local-dev/nanuqfi/`)

**Files:**
- Modify: `programs/allocator/src/lib.rs` (Deposit, Withdraw, AllocateToProtocol, RecallFromProtocol context structs)
- Test: existing `cargo test` suite

The `usdc_mint` and `share_mint` accounts are already present in each context. We just need to add `token::mint` and `token::authority` constraints to the unconstrained token accounts.

- [ ] **Step 1: Add constraints to Deposit context**

In `programs/allocator/src/lib.rs`, find the `Deposit` context struct. Change `user_usdc` and `user_shares`:

```rust
// BEFORE
/// User's USDC token account (source)
#[account(mut)]
pub user_usdc: Account<'info, TokenAccount>,

/// User's share token account (destination for minted shares)
#[account(mut)]
pub user_shares: Account<'info, TokenAccount>,

// AFTER
/// User's USDC token account (source) — constrained to correct mint
#[account(
    mut,
    token::mint = usdc_mint,
    token::authority = user,
)]
pub user_usdc: Account<'info, TokenAccount>,

/// User's share token account (destination for minted shares) — constrained
#[account(
    mut,
    token::mint = share_mint,
    token::authority = user,
)]
pub user_shares: Account<'info, TokenAccount>,
```

- [ ] **Step 2: Add constraints to Withdraw context**

In the same file, find the `Withdraw` context struct. Change `user_shares` and `user_usdc`:

```rust
// BEFORE
/// User's share token account (shares to burn)
#[account(mut)]
pub user_shares: Account<'info, TokenAccount>,

/// User's USDC token account (receives withdrawal)
#[account(mut)]
pub user_usdc: Account<'info, TokenAccount>,

// AFTER
/// User's share token account (shares to burn) — constrained
#[account(
    mut,
    token::mint = share_mint,
    token::authority = user,
)]
pub user_shares: Account<'info, TokenAccount>,

/// User's USDC token account (receives withdrawal) — constrained
#[account(
    mut,
    token::mint = usdc_mint,
    token::authority = user,
)]
pub user_usdc: Account<'info, TokenAccount>,
```

- [ ] **Step 3: Add constraints to AllocateToProtocol context**

Find the `AllocateToProtocol` context struct. Change `protocol_usdc`:

```rust
// BEFORE
/// Protocol's USDC token account (destination)
#[account(mut)]
pub protocol_usdc: Account<'info, TokenAccount>,

// AFTER
/// Protocol's USDC token account (destination) — constrained to correct mint
#[account(
    mut,
    token::mint = usdc_mint,
)]
pub protocol_usdc: Account<'info, TokenAccount>,
```

Note: No `token::authority` constraint on `protocol_usdc` because the protocol controls its own authority — we only verify the mint is USDC.

- [ ] **Step 4: Add constraints to RecallFromProtocol context**

Find the `RecallFromProtocol` context struct. Change `protocol_usdc`:

```rust
// BEFORE
/// Protocol's USDC token account (source)
#[account(mut)]
pub protocol_usdc: Account<'info, TokenAccount>,

// AFTER
/// Protocol's USDC token account (source) — constrained to correct mint
#[account(
    mut,
    token::mint = usdc_mint,
)]
pub protocol_usdc: Account<'info, TokenAccount>,
```

- [ ] **Step 5: Build and verify**

```bash
cd ~/local-dev/nanuqfi
cargo build-sbf --manifest-path programs/allocator/Cargo.toml --features devnet
```

Expected: Build succeeds with no errors.

- [ ] **Step 6: Run Rust tests**

```bash
cd ~/local-dev/nanuqfi
cargo test --manifest-path programs/allocator/Cargo.toml --features devnet
```

Expected: All 98 tests pass. Existing tests already use correct mints, so adding constraints won't break them.

- [ ] **Step 7: Run TypeScript tests**

```bash
cd ~/local-dev/nanuqfi
pnpm turbo test
```

Expected: All 209 TypeScript tests pass (core + backends + backtest).

- [ ] **Step 8: Commit**

```bash
cd ~/local-dev/nanuqfi
git add programs/allocator/src/lib.rs
git commit -m "fix(program): add token::mint and token::authority constraints

Add missing constraints to prevent token substitution attacks:
- Deposit: user_usdc (mint=usdc, auth=user), user_shares (mint=shares, auth=user)
- Withdraw: user_shares (mint=shares, auth=user), user_usdc (mint=usdc, auth=user)
- AllocateToProtocol: protocol_usdc (mint=usdc)
- RecallFromProtocol: protocol_usdc (mint=usdc)

Closes #30"
```

---

## Task 3: Fix #21 — Create RPC proxy to hide Helius API key

**Repo:** `nanuqfi/nanuqfi-app` (`~/local-dev/nanuqfi-app/`)

**Files:**
- Create: `src/app/api/rpc/route.ts`
- Modify: `src/providers/solana-provider.tsx`
- Modify: `.env.local`
- Create: `.env.example`
- Test: `src/app/api/rpc/__tests__/route.test.ts`

- [ ] **Step 1: Create branch**

```bash
cd ~/local-dev/nanuqfi-app
git checkout -b fix/p0-critical-hardening
```

- [ ] **Step 2: Write the failing test for RPC proxy**

Create `src/app/api/rpc/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('RPC proxy route', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('HELIUS_RPC_URL', 'https://devnet.helius-rpc.com/?api-key=test-key')
  })

  it('forwards valid JSON-RPC POST to Helius and returns response', async () => {
    const rpcResponse = { jsonrpc: '2.0', result: 'ok', id: 1 }
    mockFetch.mockResolvedValueOnce({
      status: 200,
      text: () => Promise.resolve(JSON.stringify(rpcResponse)),
    })

    const { POST } = await import('../route')
    const request = new Request('http://localhost:3000/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'getHealth', id: 1 }),
    })

    const response = await POST(request as any)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual(rpcResponse)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://devnet.helius-rpc.com/?api-key=test-key',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('returns 503 when HELIUS_RPC_URL is not configured', async () => {
    vi.stubEnv('HELIUS_RPC_URL', '')

    // Re-import to pick up new env
    vi.resetModules()
    const { POST } = await import('../route')
    const request = new Request('http://localhost:3000/api/rpc', {
      method: 'POST',
      body: '{}',
    })

    const response = await POST(request as any)
    expect(response.status).toBe(503)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd ~/local-dev/nanuqfi-app
pnpm vitest run src/app/api/rpc/__tests__/route.test.ts
```

Expected: FAIL — `route.ts` does not exist yet.

- [ ] **Step 4: Create the RPC proxy route**

Create `src/app/api/rpc/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const rpcUrl = process.env.HELIUS_RPC_URL

  if (!rpcUrl) {
    return NextResponse.json(
      { jsonrpc: '2.0', error: { code: -32603, message: 'RPC endpoint not configured' }, id: null },
      { status: 503 },
    )
  }

  const body = await request.text()

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })

  const data = await response.text()
  return new NextResponse(data, {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd ~/local-dev/nanuqfi-app
pnpm vitest run src/app/api/rpc/__tests__/route.test.ts
```

Expected: PASS — both tests green.

- [ ] **Step 6: Update SolanaProvider to use proxy**

In `src/providers/solana-provider.tsx`, change the RPC URL:

```typescript
// BEFORE
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://api.devnet.solana.com'

// AFTER
const RPC_URL = '/api/rpc'
```

- [ ] **Step 7: Update environment files**

Update `.env.local` — rename the variable (remove `NEXT_PUBLIC_` prefix):

```bash
# BEFORE
NEXT_PUBLIC_RPC_URL=https://devnet.helius-rpc.com/?api-key=9350fa8c-7f70-44f7-b90c-b4022228821e

# AFTER
HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=9350fa8c-7f70-44f7-b90c-b4022228821e
```

Create `.env.example` with safe defaults (no real keys):

```bash
# Solana RPC endpoint (server-side only — never use NEXT_PUBLIC_ for keys)
HELIUS_RPC_URL=https://api.devnet.solana.com

# Public config (safe to expose)
NEXT_PUBLIC_ALLOCATOR_PROGRAM_ID=2QtJ5kmxLuW2jYCFpJMtzZ7PCnKdoMwkeueYoDUi5z5P
NEXT_PUBLIC_USDC_MINT=BiTXT15XyfSakk5Yz8L8QrzHPWbK8NjoZeEMFrDvKdKh
NEXT_PUBLIC_KEEPER_API_URL=http://localhost:3001
```

- [ ] **Step 8: Verify no NEXT_PUBLIC_ vars contain API keys**

```bash
cd ~/local-dev/nanuqfi-app
grep -r "NEXT_PUBLIC_RPC_URL" src/ || echo "CLEAN: no references found"
grep -r "NEXT_PUBLIC_.*api.key\|NEXT_PUBLIC_.*helius" src/ --include="*.ts" --include="*.tsx" -i || echo "CLEAN: no exposed keys"
```

Expected: Both return "CLEAN".

- [ ] **Step 9: Build verification**

```bash
cd ~/local-dev/nanuqfi-app
pnpm build 2>&1 | tail -5
```

Expected: Build succeeds.

- [ ] **Step 10: Commit**

```bash
cd ~/local-dev/nanuqfi-app
git add src/app/api/rpc/route.ts src/app/api/rpc/__tests__/route.test.ts src/providers/solana-provider.tsx .env.example
git add .env.local  # updated var name
git commit -m "fix: move Helius RPC key to server-side proxy route

NEXT_PUBLIC_RPC_URL exposed the Helius API key in the client bundle.
Created /api/rpc server-side proxy that forwards JSON-RPC requests
to Helius using the server-only HELIUS_RPC_URL env var.

Added .env.example with safe defaults.

Closes #21"
```

---

## Task 4: Fix #22 — Use actual share price in withdraw calculations

**Repo:** `nanuqfi/nanuqfi-app` (`~/local-dev/nanuqfi-app/`)

**Files:**
- Modify: `src/components/app/deposit-form.tsx`
- Modify: `src/app/app/vaults/[riskLevel]/page.tsx`
- Test: `src/components/app/__tests__/deposit-form.test.tsx` (or existing test file)

The `sharePrice` is already computed in `useRiskVault()` as a float (e.g., `1.0`, `1.2`). It's used in the vault detail page for position valuation but NOT passed to `DepositForm`.

- [ ] **Step 1: Write the failing test**

Create or update `src/components/app/__tests__/deposit-form-share-price.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DepositForm } from '../deposit-form'

// Mock wallet + connection
vi.mock('@solana/wallet-adapter-react', () => ({
  useWallet: () => ({ publicKey: null, sendTransaction: vi.fn() }),
  useConnection: () => ({ connection: {} }),
}))
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

describe('DepositForm share price handling', () => {
  const baseProps = {
    riskLevel: 'moderate' as const,
    riskLevelNum: 1,
    apy: 0.08,
    dailyEarnings: 0.22,
  }

  it('MAX button uses share price for withdraw USDC estimate', () => {
    render(
      <DepositForm
        {...baseProps}
        userShares={100_000_000n}  // 100 shares (6 decimals)
        sharePrice={1.2}           // 1 share = 1.2 USDC
      />,
    )

    // Switch to withdraw mode
    fireEvent.click(screen.getByText('Withdraw'))
    // Click MAX
    fireEvent.click(screen.getByText('MAX'))

    const input = screen.getByPlaceholderText('0.00') as HTMLInputElement
    // 100 shares * 1.2 price = 120 USDC
    expect(Number(input.value)).toBeCloseTo(120, 1)
  })

  it('MAX button defaults to 1:1 when sharePrice not provided', () => {
    render(
      <DepositForm
        {...baseProps}
        userShares={100_000_000n}
      />,
    )

    fireEvent.click(screen.getByText('Withdraw'))
    fireEvent.click(screen.getByText('MAX'))

    const input = screen.getByPlaceholderText('0.00') as HTMLInputElement
    // 100 shares * 1.0 price = 100 USDC
    expect(Number(input.value)).toBeCloseTo(100, 1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/local-dev/nanuqfi-app
pnpm vitest run src/components/app/__tests__/deposit-form-share-price.test.tsx
```

Expected: FAIL — `sharePrice` prop doesn't exist on DepositForm.

- [ ] **Step 3: Add sharePrice prop to DepositForm**

In `src/components/app/deposit-form.tsx`, update the interface and logic:

```typescript
// BEFORE (interface)
interface DepositFormProps {
  riskLevel: RiskLevel
  riskLevelNum: number
  apy: number
  dailyEarnings: number
  walletBalance?: number
  shareMint?: PublicKey
  userShares?: bigint
  redemptionPeriodSlots?: bigint
  onSuccess?: () => void
}

// AFTER (interface)
interface DepositFormProps {
  riskLevel: RiskLevel
  riskLevelNum: number
  apy: number
  dailyEarnings: number
  walletBalance?: number
  shareMint?: PublicKey
  userShares?: bigint
  sharePrice?: number
  redemptionPeriodSlots?: bigint
  onSuccess?: () => void
}
```

Update the destructured props:

```typescript
// BEFORE
}: DepositFormProps) {

// AFTER — add sharePrice to destructuring
  sharePrice,
}: DepositFormProps) {
```

Update `handleMax()`:

```typescript
// BEFORE
  } else if (mode === 'withdraw' && userShares !== undefined && userShares > 0n) {
    // Convert shares back to approximate USDC for display
    // Share price ~1:1 at initialization, so shares / 1e6 gives USDC
    setAmount(String(Number(userShares) / 10 ** USDC_DECIMALS))
  }

// AFTER
  } else if (mode === 'withdraw' && userShares !== undefined && userShares > 0n) {
    // Convert shares to USDC using actual share price
    const price = sharePrice ?? 1
    setAmount(String(Number(userShares) * price / 10 ** USDC_DECIMALS))
  }
```

Update `handleWithdraw()` — convert USDC input to shares using price:

```typescript
// BEFORE
    // Convert entered USDC amount to shares
    // For simplicity, treat 1 share = 1 USDC smallest unit at 1:1 price
    const sharesAmount = BigInt(Math.round(parsedAmount * 10 ** USDC_DECIMALS))

// AFTER
    // Convert entered USDC amount to shares using actual share price
    const price = sharePrice ?? 1
    const sharesAmount = BigInt(Math.round(parsedAmount / price * 10 ** USDC_DECIMALS))
```

Update the shares display label in the withdraw tab to show USDC value:

```typescript
// BEFORE
          {mode === 'withdraw' && userShares !== undefined && (
            <span className="text-xs text-slate-500 font-mono">
              Shares: {(Number(userShares) / 10 ** USDC_DECIMALS).toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </span>
          )}

// AFTER
          {mode === 'withdraw' && userShares !== undefined && (
            <span className="text-xs text-slate-500 font-mono">
              Value: {(Number(userShares) * (sharePrice ?? 1) / 10 ** USDC_DECIMALS).toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC
            </span>
          )}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/local-dev/nanuqfi-app
pnpm vitest run src/components/app/__tests__/deposit-form-share-price.test.tsx
```

Expected: PASS — both share price tests green.

- [ ] **Step 5: Pass sharePrice from vault detail page**

In `src/app/app/vaults/[riskLevel]/page.tsx`, find where `DepositForm` is rendered and add `sharePrice`:

```typescript
// BEFORE
          <DepositForm
            riskLevel={riskLevel}
            riskLevelNum={riskLevelNum}
            apy={apy}
            dailyEarnings={dailyEarnings}
            walletBalance={walletBalance}
            shareMint={onChain.data?.shareMint}
            userShares={userPosition.data?.shares}
            redemptionPeriodSlots={onChain.data?.redemptionPeriodSlots}
            onSuccess={() => {

// AFTER
          <DepositForm
            riskLevel={riskLevel}
            riskLevelNum={riskLevelNum}
            apy={apy}
            dailyEarnings={dailyEarnings}
            walletBalance={walletBalance}
            shareMint={onChain.data?.shareMint}
            userShares={userPosition.data?.shares}
            sharePrice={onChain.data?.sharePrice}
            redemptionPeriodSlots={onChain.data?.redemptionPeriodSlots}
            onSuccess={() => {
```

- [ ] **Step 6: Run full test suite**

```bash
cd ~/local-dev/nanuqfi-app
pnpm vitest run
```

Expected: All tests pass (existing 62 + 2 new = 64).

- [ ] **Step 7: Commit**

```bash
cd ~/local-dev/nanuqfi-app
git add src/components/app/deposit-form.tsx src/app/app/vaults/\\[riskLevel\\]/page.tsx src/components/app/__tests__/deposit-form-share-price.test.tsx
git commit -m "fix: use actual share price in withdraw calculations

MAX button and withdraw amount conversion assumed 1:1 share price.
Now uses on-chain sharePrice from useRiskVault() hook.
Formula: usdcValue = shares * sharePrice / 1e6

Closes #22"
```

---

## Task 5: Fix #9 — Await rebalance and handle tx failure

**Repo:** `nanuqfi/nanuqfi-keeper` (`~/local-dev/nanuqfi-keeper/`)

**Files:**
- Modify: `src/keeper.ts` (KeeperDecision interface + runCycle method)
- Test: `src/__tests__/keeper-rebalance.test.ts` (new)

- [ ] **Step 1: Create branch**

```bash
cd ~/local-dev/nanuqfi-keeper
git checkout -b fix/p0-critical-hardening
```

- [ ] **Step 2: Write the failing test**

Create `src/__tests__/keeper-rebalance.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all external dependencies
vi.mock('../chain/rebalance', () => ({
  submitRebalance: vi.fn(),
}))
vi.mock('../ai/prompt-builder', () => ({
  buildInsightPrompt: vi.fn().mockReturnValue('test prompt'),
}))
vi.mock('../market/scanner', () => ({
  scanDeFiYields: vi.fn().mockResolvedValue({ protocols: [] }),
}))

import { submitRebalance } from '../chain/rebalance'
import type { KeeperDecision } from '../keeper'

const mockSubmitRebalance = vi.mocked(submitRebalance)

describe('keeper rebalance awaiting', () => {
  let keeper: any

  beforeEach(async () => {
    vi.resetAllMocks()

    // Dynamically import to get fresh instance
    vi.resetModules()
    const { NanuqKeeper } = await import('../keeper')
    keeper = new NanuqKeeper({
      rpcUrls: ['https://test-rpc.com'],
      keeperKeypairPath: '/tmp/test-keypair.json',
      cycleIntervalMs: 60_000,
      aiEnabled: false,
      alertTelegramToken: '',
      alertTelegramChatId: '',
    })

    // Stub methods that touch external systems
    keeper.fetchYieldData = vi.fn().mockResolvedValue({
      kamino: { apy: 0.08, tvl: 1000000 },
      marginfi: { apy: 0.065, tvl: 2000000 },
      lulo: { apy: 0.07, tvl: 500000 },
    })
    keeper.alerter = { alert: vi.fn().mockResolvedValue(undefined) }
    keeper.monitor = {
      recordCycleSuccess: vi.fn(),
      recordCycleFailure: vi.fn(),
    }
  })

  it('does NOT record decision as confirmed when submitRebalance fails', async () => {
    mockSubmitRebalance.mockResolvedValue({
      success: false,
      error: 'Transaction simulation failed',
    })

    await keeper.runCycle()

    // Decisions should exist but be marked as failed
    const decisions: KeeperDecision[] = keeper.decisions
    const failedDecisions = decisions.filter((d: KeeperDecision) => d.txStatus === 'failed')
    expect(failedDecisions.length).toBeGreaterThan(0)

    // No decision should be marked as confirmed
    const confirmedDecisions = decisions.filter((d: KeeperDecision) => d.txStatus === 'confirmed')
    expect(confirmedDecisions).toHaveLength(0)
  })

  it('records decision as confirmed when submitRebalance succeeds', async () => {
    mockSubmitRebalance.mockResolvedValue({
      success: true,
      txSignature: 'abc123signature',
    })

    await keeper.runCycle()

    const decisions: KeeperDecision[] = keeper.decisions
    const confirmed = decisions.filter((d: KeeperDecision) => d.txStatus === 'confirmed')
    expect(confirmed.length).toBeGreaterThan(0)
    expect(confirmed[0].txSignature).toBe('abc123signature')
  })

  it('sends alert when rebalance tx fails', async () => {
    mockSubmitRebalance.mockResolvedValue({
      success: false,
      error: 'Blockhash expired',
    })

    await keeper.runCycle()

    expect(keeper.alerter.alert).toHaveBeenCalledWith(
      expect.stringContaining('rebalance failed'),
    )
  })

  it('does NOT update currentWeights when tx fails', async () => {
    const originalWeights = { ...keeper.currentWeights }
    mockSubmitRebalance.mockResolvedValue({
      success: false,
      error: 'Simulation failed',
    })

    await keeper.runCycle()

    // Weights should not have changed for vaults with failed tx
    // (they may still change for algorithm-only mode)
    const failedDecisions: KeeperDecision[] = keeper.decisions.filter(
      (d: KeeperDecision) => d.txStatus === 'failed',
    )
    for (const d of failedDecisions) {
      expect(keeper.currentWeights[d.riskLevel]).toEqual(
        originalWeights[d.riskLevel] ?? {},
      )
    }
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd ~/local-dev/nanuqfi-keeper
pnpm vitest run src/__tests__/keeper-rebalance.test.ts
```

Expected: FAIL — `txStatus` property doesn't exist on `KeeperDecision`.

- [ ] **Step 4: Add txStatus to KeeperDecision interface**

In `src/keeper.ts`, update the `KeeperDecision` interface:

```typescript
// BEFORE
export interface KeeperDecision {
  timestamp: number
  riskLevel: string
  proposal: WeightProposal
  yieldData: YieldData
  aiInsight?: AIInsight
  txSignature?: string
}

// AFTER
export interface KeeperDecision {
  timestamp: number
  riskLevel: string
  proposal: WeightProposal
  yieldData: YieldData
  aiInsight?: AIInsight
  txSignature?: string
  txStatus?: 'pending' | 'confirmed' | 'failed'
}
```

- [ ] **Step 5: Rewrite submitRebalance call to await**

In `src/keeper.ts`, replace the fire-and-forget block in `runCycle()`. Find the section inside the `for (const riskLevel of vaults)` loop that starts with `// Submit rebalance tx`:

```typescript
// ─── BEFORE (fire-and-forget) ─────────────────────────────────────────

      // Submit rebalance tx to on-chain allocator (if keypair configured)
      if (this.config.keeperKeypairPath && this.config.rpcUrls[0]) {
        const reasoning = this.getAIInsight()?.reasoning ?? 'Algorithm-only rebalance'
        submitRebalance({
          rpcUrl: this.config.rpcUrls[0],
          keypairPath: this.config.keeperKeypairPath,
          riskLevel,
          weights: proposal.weights,
          reasoning,
          rebalanceCounter: this.decisions.length,
          equitySnapshot: 0n,
          vaultUsdcAddress: new (await import('@solana/web3.js')).PublicKey('11111111111111111111111111111111'),
          treasuryUsdcAddress: new (await import('@solana/web3.js')).PublicKey('11111111111111111111111111111111'),
        }).then(result => {
          if (result.success) {
            console.log(`[Chain] Rebalance tx submitted: ${result.txSignature}`)
            // Store tx in the latest decision
            const lastDecision = this.decisions[this.decisions.length - 1]
            if (lastDecision) lastDecision.txSignature = result.txSignature
          } else {
            console.warn(`[Chain] Rebalance tx failed: ${result.error}`)
            this.alerter.alert(`❌ On-chain rebalance failed: ${result.error}`).catch(() => {})
          }
        }).catch(err => {
          console.warn(`[Chain] Rebalance submission error: ${err instanceof Error ? err.message : err}`)
        })
      }

// ─── AFTER (awaited with proper status tracking) ──────────────────────

      // Submit rebalance tx to on-chain allocator (if keypair configured)
      if (this.config.keeperKeypairPath && this.config.rpcUrls[0]) {
        const reasoning = this.getAIInsight()?.reasoning ?? 'Algorithm-only rebalance'
        const decision = this.decisions[this.decisions.length - 1]

        try {
          const result = await submitRebalance({
            rpcUrl: this.config.rpcUrls[0],
            keypairPath: this.config.keeperKeypairPath,
            riskLevel,
            weights: proposal.weights,
            reasoning,
            rebalanceCounter: this.decisions.length,
            equitySnapshot: 0n,
            vaultUsdcAddress: new (await import('@solana/web3.js')).PublicKey('11111111111111111111111111111111'),
            treasuryUsdcAddress: new (await import('@solana/web3.js')).PublicKey('11111111111111111111111111111111'),
          })

          if (result.success) {
            if (decision) {
              decision.txSignature = result.txSignature
              decision.txStatus = 'confirmed'
            }
            this.currentWeights[riskLevel] = proposal.weights
            console.log(`[Chain] Rebalance tx confirmed: ${result.txSignature}`)
          } else {
            if (decision) decision.txStatus = 'failed'
            console.error(`[Chain] Rebalance tx failed for ${riskLevel}: ${result.error}`)
            await this.alerter.alert(`❌ On-chain rebalance failed for ${riskLevel}: ${result.error}`)
          }
        } catch (err) {
          if (decision) decision.txStatus = 'failed'
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`[Chain] Rebalance submission error for ${riskLevel}: ${msg}`)
          await this.alerter.alert(`❌ On-chain rebalance error for ${riskLevel}: ${msg}`)
        }
      } else {
        // Algorithm-only mode — no on-chain tx, update weights directly
        this.currentWeights[riskLevel] = proposal.weights
      }
```

Also, move the `this.currentWeights[riskLevel] = proposal.weights` line that's BEFORE the submit block — it must be removed from its current position (before the if block) since we now set it conditionally inside. Find and remove:

```typescript
// REMOVE this line (currently before the submit block):
      this.currentWeights[riskLevel] = proposal.weights
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd ~/local-dev/nanuqfi-keeper
pnpm vitest run src/__tests__/keeper-rebalance.test.ts
```

Expected: PASS — all 4 tests green.

- [ ] **Step 7: Run full test suite**

```bash
cd ~/local-dev/nanuqfi-keeper
pnpm vitest run
```

Expected: All 206+ tests pass.

- [ ] **Step 8: Commit**

```bash
cd ~/local-dev/nanuqfi-keeper
git add src/keeper.ts src/__tests__/keeper-rebalance.test.ts
git commit -m "fix: await rebalance tx and track confirmation status

submitRebalance was fire-and-forget — cycle logged success before
tx confirmed. Now awaits the result and:
- On success: marks decision as 'confirmed', updates weights
- On failure: marks as 'failed', keeps old weights, sends alert
- Algorithm-only mode (no keypair): updates weights directly

Added txStatus field to KeeperDecision interface.

Closes #9"
```

---

## Task 6: Push branches and create PRs

- [ ] **Step 1: Push nanuqfi core branch**

```bash
cd ~/local-dev/nanuqfi
git push -u origin fix/p0-critical-hardening
```

- [ ] **Step 2: Push nanuqfi-app branch**

```bash
cd ~/local-dev/nanuqfi-app
git push -u origin fix/p0-critical-hardening
```

- [ ] **Step 3: Push nanuqfi-keeper branch**

```bash
cd ~/local-dev/nanuqfi-keeper
git push -u origin fix/p0-critical-hardening
```

- [ ] **Step 4: Create PRs (3 total)**

Core PR:
```bash
cd ~/local-dev/nanuqfi
gh pr create --title "fix: P0-critical security hardening (#29, #30)" --body "## Summary
- Remove devnet from default Cargo features — admin instructions no longer leak to mainnet (#29)
- Add token::mint and token::authority constraints on user_usdc, user_shares, protocol_usdc (#30)

## Test plan
- [ ] cargo build-sbf (no features) succeeds without devnet admin instructions
- [ ] cargo build-sbf --features devnet still compiles all instructions
- [ ] cargo test --features devnet — all 98 tests pass
- [ ] pnpm turbo test — all TS tests pass"
```

App PR:
```bash
cd ~/local-dev/nanuqfi-app
gh pr create --title "fix: P0-critical RPC key exposure + share price bug (#21, #22)" --body "## Summary
- Move Helius RPC key from NEXT_PUBLIC_ to server-side /api/rpc proxy (#21)
- Use actual on-chain share price in withdraw calculations (#22)

## Test plan
- [ ] pnpm build succeeds
- [ ] grep NEXT_PUBLIC_RPC_URL src/ returns zero hits
- [ ] RPC proxy test passes
- [ ] Share price test: 1.2x price, 100 shares = 120 USDC
- [ ] pnpm vitest run — all tests pass"
```

Keeper PR:
```bash
cd ~/local-dev/nanuqfi-keeper
gh pr create --title "fix: P0-critical fire-and-forget rebalance (#9)" --body "## Summary
- Await submitRebalance instead of fire-and-forget
- Track txStatus (pending/confirmed/failed) on KeeperDecision
- Send Telegram alert on tx failure
- Only update currentWeights on confirmed tx

## Test plan
- [ ] Failed tx → decision marked 'failed', weights unchanged
- [ ] Successful tx → decision marked 'confirmed', weights updated
- [ ] Failed tx → alert sent
- [ ] pnpm vitest run — all tests pass"
```
