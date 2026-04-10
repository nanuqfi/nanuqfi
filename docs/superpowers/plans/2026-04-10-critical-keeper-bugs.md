# Critical Keeper Bugs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 critical bugs that make the keeper's on-chain rebalance submissions non-functional (#1, #2, #3).

**Architecture:** Create a chain state utility for on-chain reads, wire real addresses/counter into submitRebalance, and add live Marginfi rate fetching. One branch `fix/critical-keeper-bugs` in nanuqfi-keeper.

**Tech Stack:** TypeScript, @solana/web3.js, @coral-xyz/anchor, Vitest

---

## File Structure

```
src/
  chain/
    state.ts          # NEW — fetch on-chain account state (RiskVault, Treasury, token balances)
    rebalance.ts      # EXISTING — add getAssociatedTokenAddress helper
  rates/
    marginfi.ts       # NEW — live Marginfi rate fetching via DeFi Llama
  keeper.ts           # MODIFY — wire real chain state + live rates
  __tests__/
    chain-state.test.ts     # NEW — tests for chain state fetcher
    marginfi-rate.test.ts   # NEW — tests for rate fetching
```

---

## Task 1: Create chain state utility

**Files:**
- Create: `src/chain/state.ts`
- Create: `src/__tests__/chain-state.test.ts`
- Modify: `src/chain/rebalance.ts` (add ATA helper)

This task creates the shared infrastructure that bugs #1 and #2 both need: reading on-chain account data to get real addresses and counters.

- [ ] **Step 1: Create branch**

```bash
cd ~/local-dev/nanuqfi-keeper
git checkout -b fix/critical-keeper-bugs
```

- [ ] **Step 2: Write the failing test**

Create `src/__tests__/chain-state.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Connection, PublicKey } from '@solana/web3.js'

vi.mock('@solana/web3.js', async () => {
  const actual = await vi.importActual<typeof import('@solana/web3.js')>('@solana/web3.js')
  return {
    ...actual,
    Connection: vi.fn(),
  }
})

import { fetchRebalanceChainState } from '../chain/state'

describe('fetchRebalanceChainState', () => {
  let mockConnection: any

  beforeEach(() => {
    mockConnection = {
      getAccountInfo: vi.fn(),
      getTokenAccountBalance: vi.fn(),
    }
    vi.mocked(Connection).mockImplementation(() => mockConnection)
  })

  it('returns rebalance counter from RiskVault account', async () => {
    // Build mock RiskVault account data
    // Offset for rebalance_counter: 8 (disc) + 1 + 32 + 1 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 8 = 156
    const data = Buffer.alloc(256)
    data.writeUInt32LE(42, 8 + 1 + 32 + 1 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 8) // counter = 42

    // Mock Treasury account data
    // Offset for usdc_token_account: 8 (disc) + 1 + 32 = 41
    const treasuryData = Buffer.alloc(128)
    const fakeTreasuryUsdc = PublicKey.unique()
    fakeTreasuryUsdc.toBuffer().copy(treasuryData, 8 + 1 + 32)

    mockConnection.getAccountInfo
      .mockResolvedValueOnce({ data }) // RiskVault
      .mockResolvedValueOnce({ data: treasuryData }) // Treasury

    mockConnection.getTokenAccountBalance.mockResolvedValueOnce({
      value: { amount: '5000000', decimals: 6 },
    })

    const result = await fetchRebalanceChainState('https://rpc.test', 'moderate')

    expect(result.rebalanceCounter).toBe(42)
    expect(result.treasuryUsdcAddress.equals(fakeTreasuryUsdc)).toBe(true)
    expect(result.equitySnapshot).toBe(5000000n)
  })

  it('throws when RiskVault account not found', async () => {
    mockConnection.getAccountInfo.mockResolvedValueOnce(null)

    await expect(
      fetchRebalanceChainState('https://rpc.test', 'moderate'),
    ).rejects.toThrow('RiskVault account not found')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm vitest run src/__tests__/chain-state.test.ts
```

Expected: FAIL — `chain/state.ts` does not exist.

- [ ] **Step 4: Add ATA derivation helper to rebalance.ts**

In `src/chain/rebalance.ts`, add these constants and helper at the top (after existing imports):

```typescript
const SPL_TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
const ASSOCIATED_TOKEN_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')

export function getAssociatedTokenAddress(mint: PublicKey, owner: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), SPL_TOKEN_PROGRAM.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM,
  )
  return ata
}
```

- [ ] **Step 5: Create chain state fetcher**

Create `src/chain/state.ts`:

```typescript
import { Connection, PublicKey } from '@solana/web3.js'
import {
  deriveAllocatorPda,
  deriveRiskVaultPda,
  deriveTreasuryPda,
  getAssociatedTokenAddress,
  riskLevelToIndex,
  USDC_MINT,
} from './rebalance'

// ─── Byte offsets for Anchor account deserialization ────────────────────
// All offsets include the 8-byte Anchor discriminator prefix.

// RiskVault: disc(8) + version(1) + allocator(32) + risk_level(1) +
//            protocol_vault(32) + share_mint(32) + total_shares(8) +
//            total_assets(8) + peak_equity(8) + current_equity(8) +
//            equity_24h_ago(8) + last_rebalance_slot(8) = 156
const RISK_VAULT_REBALANCE_COUNTER_OFFSET = 8 + 1 + 32 + 1 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 8

// Treasury: disc(8) + version(1) + allocator(32) = 41
const TREASURY_USDC_ACCOUNT_OFFSET = 8 + 1 + 32

// ─── Types ──────────────────────────────────────────────────────────────

export interface RebalanceChainState {
  rebalanceCounter: number
  vaultUsdcAddress: PublicKey
  treasuryUsdcAddress: PublicKey
  equitySnapshot: bigint
}

// ─── Fetcher ────────────────────────────────────────────────────────────

export async function fetchRebalanceChainState(
  rpcUrl: string,
  riskLevel: string,
): Promise<RebalanceChainState> {
  const connection = new Connection(rpcUrl, 'confirmed')
  const riskIdx = riskLevelToIndex(riskLevel)

  const [allocatorPda] = deriveAllocatorPda()
  const [riskVaultPda] = deriveRiskVaultPda(allocatorPda, riskIdx)
  const [treasuryPda] = deriveTreasuryPda()

  // Fetch RiskVault + Treasury in parallel
  const [riskVaultInfo, treasuryInfo] = await Promise.all([
    connection.getAccountInfo(riskVaultPda),
    connection.getAccountInfo(treasuryPda),
  ])

  if (!riskVaultInfo?.data) {
    throw new Error(`RiskVault account not found for ${riskLevel} (PDA: ${riskVaultPda.toBase58()})`)
  }
  if (!treasuryInfo?.data) {
    throw new Error(`Treasury account not found (PDA: ${treasuryPda.toBase58()})`)
  }

  // Read rebalance_counter (u32 LE) from RiskVault
  const rebalanceCounter = riskVaultInfo.data.readUInt32LE(RISK_VAULT_REBALANCE_COUNTER_OFFSET)

  // Read usdc_token_account (Pubkey, 32 bytes) from Treasury
  const treasuryUsdcAddress = new PublicKey(
    treasuryInfo.data.subarray(TREASURY_USDC_ACCOUNT_OFFSET, TREASURY_USDC_ACCOUNT_OFFSET + 32),
  )

  // Derive vault USDC ATA (allocator PDA owns it)
  const vaultUsdcAddress = getAssociatedTokenAddress(USDC_MINT, allocatorPda)

  // Fetch vault USDC balance for equity snapshot
  const balance = await connection.getTokenAccountBalance(vaultUsdcAddress)
  const equitySnapshot = BigInt(balance.value.amount)

  return { rebalanceCounter, vaultUsdcAddress, treasuryUsdcAddress, equitySnapshot }
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm vitest run src/__tests__/chain-state.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/chain/state.ts src/chain/rebalance.ts src/__tests__/chain-state.test.ts
git commit -m "feat(chain): add on-chain state fetcher for rebalance params

Reads RiskVault rebalance_counter, Treasury USDC address, and vault
USDC balance from on-chain accounts. Used by submitRebalance to pass
real addresses instead of placeholders."
```

---

## Task 2: Wire real chain state into submitRebalance (#1, #2)

**Files:**
- Modify: `src/keeper.ts` (runCycle submitRebalance call)
- Modify: `src/__tests__/keeper-rebalance.test.ts` (update mocks)

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/keeper-rebalance.test.ts`:

```typescript
// Add mock at top of file
vi.mock('../chain/state', () => ({
  fetchRebalanceChainState: vi.fn(),
}))

import { fetchRebalanceChainState } from '../chain/state'

const mockFetchChainState = vi.mocked(fetchRebalanceChainState)
```

Add test case:

```typescript
  it('passes real chain state to submitRebalance', async () => {
    const fakeVaultUsdc = PublicKey.unique()
    const fakeTreasuryUsdc = PublicKey.unique()

    mockFetchChainState.mockResolvedValue({
      rebalanceCounter: 7,
      vaultUsdcAddress: fakeVaultUsdc,
      treasuryUsdcAddress: fakeTreasuryUsdc,
      equitySnapshot: 5000000n,
    })

    mockSubmitRebalance.mockResolvedValue({
      success: true,
      txSignature: 'real-chain-state-tx',
    })

    await keeper.runCycle()

    expect(mockSubmitRebalance).toHaveBeenCalledWith(
      expect.objectContaining({
        rebalanceCounter: 7,
        equitySnapshot: 5000000n,
        vaultUsdcAddress: fakeVaultUsdc,
        treasuryUsdcAddress: fakeTreasuryUsdc,
      }),
    )
  })

  it('marks decision as failed when chain state fetch fails', async () => {
    mockFetchChainState.mockRejectedValue(new Error('RPC timeout'))

    await keeper.runCycle()

    const decisions: KeeperDecision[] = keeper.decisions
    const failed = decisions.filter((d: KeeperDecision) => d.txStatus === 'failed')
    expect(failed.length).toBeGreaterThan(0)
    expect(keeper.alerter.alert).toHaveBeenCalledWith(
      expect.stringContaining('RPC timeout'),
    )
  })
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/__tests__/keeper-rebalance.test.ts
```

Expected: FAIL — keeper still uses hardcoded System Program addresses.

- [ ] **Step 3: Update runCycle to fetch and use real chain state**

In `src/keeper.ts`, add the import at the top:

```typescript
import { fetchRebalanceChainState } from './chain/state'
```

Replace the submitRebalance block inside the `if (this.config.keeperKeypairPath && this.config.rpcUrls[0])` section. The current code has hardcoded addresses. Replace with:

```typescript
        // Submit rebalance tx to on-chain allocator (if keypair configured)
        if (this.config.keeperKeypairPath && this.config.rpcUrls[0]) {
          const reasoning = this.getAIInsight()?.reasoning ?? 'Algorithm-only rebalance'
          const decision = this.decisions[this.decisions.length - 1]

          if (decision) decision.txStatus = 'pending'

          try {
            // Fetch real on-chain state: counter, addresses, equity
            const chainState = await fetchRebalanceChainState(this.config.rpcUrls[0], riskLevel)

            const result = await submitRebalance({
              rpcUrl: this.config.rpcUrls[0],
              keypairPath: this.config.keeperKeypairPath,
              riskLevel,
              weights: proposal.weights,
              reasoning,
              rebalanceCounter: chainState.rebalanceCounter,
              equitySnapshot: chainState.equitySnapshot,
              vaultUsdcAddress: chainState.vaultUsdcAddress,
              treasuryUsdcAddress: chainState.treasuryUsdcAddress,
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

Key changes from current code:
- `rebalanceCounter: chainState.rebalanceCounter` (was `this.decisions.length`)
- `equitySnapshot: chainState.equitySnapshot` (was `0n`)
- `vaultUsdcAddress: chainState.vaultUsdcAddress` (was System Program)
- `treasuryUsdcAddress: chainState.treasuryUsdcAddress` (was System Program)
- Removed the `await import('@solana/web3.js')` dynamic imports (no longer needed)

- [ ] **Step 4: Update existing test mocks**

In `src/__tests__/keeper-rebalance.test.ts`, the `beforeEach` needs to mock `fetchRebalanceChainState` with default values so existing tests don't break:

```typescript
  beforeEach(async () => {
    vi.resetAllMocks()

    // Default chain state mock — existing tests need this
    mockFetchChainState.mockResolvedValue({
      rebalanceCounter: 0,
      vaultUsdcAddress: PublicKey.default,
      treasuryUsdcAddress: PublicKey.default,
      equitySnapshot: 1000000n,
    })

    // ... rest of existing beforeEach
  })
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm vitest run src/__tests__/keeper-rebalance.test.ts
```

Expected: All tests pass (existing + 2 new).

- [ ] **Step 6: Run full suite**

```bash
pnpm vitest run
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/keeper.ts src/__tests__/keeper-rebalance.test.ts
git commit -m "fix: use real on-chain addresses and counter for rebalance

Replaced hardcoded System Program addresses and global decision
count with real on-chain state:
- vaultUsdcAddress: derived ATA for allocator PDA
- treasuryUsdcAddress: read from Treasury account
- equitySnapshot: vault USDC token balance
- rebalanceCounter: per-vault counter from RiskVault account

Closes #1, closes #2"
```

---

## Task 3: Add live Marginfi rate fetching (#3)

**Files:**
- Create: `src/rates/marginfi.ts`
- Create: `src/__tests__/marginfi-rate.test.ts`
- Modify: `src/keeper.ts` (fetchYieldData)

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/marginfi-rate.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { fetchMarginfiRate, MARGINFI_FALLBACK_RATE } from '../rates/marginfi'

describe('fetchMarginfiRate', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns live APY from DeFi Llama', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: [
          { project: 'marginfi', symbol: 'USDC', chain: 'Solana', apy: 7.5, tvlUsd: 50000000 },
          { project: 'other', symbol: 'USDC', chain: 'Solana', apy: 3.0, tvlUsd: 10000000 },
        ],
      }),
    })

    const rate = await fetchMarginfiRate()
    expect(rate).toBeCloseTo(0.075, 3) // 7.5% → 0.075
  })

  it('returns fallback when API fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const rate = await fetchMarginfiRate()
    expect(rate).toBe(MARGINFI_FALLBACK_RATE)
  })

  it('returns fallback when pool not found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    })

    const rate = await fetchMarginfiRate()
    expect(rate).toBe(MARGINFI_FALLBACK_RATE)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/__tests__/marginfi-rate.test.ts
```

Expected: FAIL — `rates/marginfi.ts` does not exist.

- [ ] **Step 3: Create the rate fetcher**

Create `src/rates/marginfi.ts`:

```typescript
export const MARGINFI_FALLBACK_RATE = 0.065

const DEFI_LLAMA_POOLS_URL = 'https://yields.llama.fi/pools'
const TIMEOUT_MS = 10_000

/**
 * Fetch live Marginfi USDC lending rate from DeFi Llama.
 * Falls back to 6.5% if the API is unavailable or the pool isn't found.
 */
export async function fetchMarginfiRate(): Promise<number> {
  try {
    const res = await fetch(DEFI_LLAMA_POOLS_URL, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!res.ok) {
      console.warn(`[Marginfi] DeFi Llama API returned ${res.status}, using fallback`)
      return MARGINFI_FALLBACK_RATE
    }

    const data = await res.json()
    const pool = data.data?.find(
      (p: { project: string; symbol: string; chain: string }) =>
        p.project === 'marginfi' &&
        p.symbol === 'USDC' &&
        p.chain === 'Solana',
    )

    if (!pool || typeof pool.apy !== 'number') {
      console.warn('[Marginfi] USDC pool not found on DeFi Llama, using fallback')
      return MARGINFI_FALLBACK_RATE
    }

    const rate = pool.apy / 100 // DeFi Llama returns percentage (e.g., 7.5 → 0.075)
    console.log(`[Marginfi] Live rate: ${(rate * 100).toFixed(2)}%`)
    return rate
  } catch (err) {
    console.warn(`[Marginfi] Rate fetch failed: ${err instanceof Error ? err.message : err}, using fallback`)
    return MARGINFI_FALLBACK_RATE
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run src/__tests__/marginfi-rate.test.ts
```

Expected: PASS — all 3 tests green.

- [ ] **Step 5: Wire into keeper's fetchYieldData**

In `src/keeper.ts`, add the import:

```typescript
import { fetchMarginfiRate } from './rates/marginfi'
```

Find the `fetchYieldData()` method. Locate the hardcoded Marginfi rate line:

```typescript
// BEFORE
marginfiLendingRate: 0.065, // Mock — Marginfi SDK has broken IDL

// AFTER
marginfiLendingRate: await fetchMarginfiRate(),
```

- [ ] **Step 6: Run full test suite**

```bash
pnpm vitest run
```

Expected: All tests pass. Existing tests that mock `fetchYieldData` won't be affected since they stub the entire method.

- [ ] **Step 7: Commit**

```bash
git add src/rates/marginfi.ts src/__tests__/marginfi-rate.test.ts src/keeper.ts
git commit -m "fix: fetch live Marginfi USDC lending rate from DeFi Llama

Replaced hardcoded 6.5% rate with live fetch from DeFi Llama pools
API. Falls back to 6.5% if API unavailable or pool not found.
Follows same pattern as Kamino and Lulo rate fetchers.

Closes #3"
```

---

## Task 4: Push and create PR

- [ ] **Step 1: Push branch**

```bash
cd ~/local-dev/nanuqfi-keeper
git push -u origin fix/critical-keeper-bugs
```

- [ ] **Step 2: Create PR**

```bash
gh pr create --title "fix: critical keeper bugs — real addresses, counter, live rates (#1, #2, #3)" --body "## Summary
- Fetch real on-chain addresses for vault USDC and treasury USDC instead of System Program placeholders (#1)
- Use per-vault rebalance counter from RiskVault account instead of global decision count (#2)
- Fetch live Marginfi USDC rate from DeFi Llama instead of hardcoded 6.5% (#3)

## Changes
- \`src/chain/state.ts\`: On-chain account reader (RiskVault counter, Treasury USDC address, vault balance)
- \`src/chain/rebalance.ts\`: Added ATA derivation helper
- \`src/rates/marginfi.ts\`: DeFi Llama rate fetcher with 6.5% fallback
- \`src/keeper.ts\`: Wired real chain state + live rate into runCycle

## Test plan
- [ ] Chain state: reads counter from mock RiskVault data, throws on missing account
- [ ] submitRebalance receives real addresses and counter (not System Program)
- [ ] Chain state fetch failure → decision marked failed + alert sent
- [ ] Marginfi rate: parses DeFi Llama response, falls back on error/missing pool
- [ ] pnpm vitest run — all tests pass"
```
