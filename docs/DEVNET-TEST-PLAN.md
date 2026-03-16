# NanuqFi Devnet Stress Test Plan

**Purpose:** Comprehensive verification of ALL systems on devnet before mainnet deployment.
**Rule:** Every test must PASS on devnet before moving to mainnet. No exceptions.
**Tracker:** Update checkboxes as each test passes. Date + tx signature for on-chain tests.

---

## Phase A: Unit & Integration Tests (Local)

All automated tests must pass first.

- [ ] **A1.** `@nanuqfi/core` — 28 tests
  ```bash
  cd ~/local-dev/nanuqfi && pnpm turbo test --filter=@nanuqfi/core
  ```

- [ ] **A2.** `@nanuqfi/backend-drift` — 141 tests
  ```bash
  cd ~/local-dev/nanuqfi && pnpm turbo test --filter=@nanuqfi/backend-drift
  ```

- [ ] **A3.** `nanuqfi-keeper` — 183 tests
  ```bash
  cd ~/local-dev/nanuqfi-keeper && pnpm test
  ```

- [ ] **A4.** `nanuqfi-app` — 12 tests
  ```bash
  cd ~/local-dev/nanuqfi-app && pnpm test
  ```

- [ ] **A5.** Anchor build — zero errors
  ```bash
  cd ~/local-dev/nanuqfi && anchor build
  ```

- [ ] **A6.** Frontend build — zero errors
  ```bash
  cd ~/local-dev/nanuqfi-app && pnpm build
  ```

**Gate:** ALL must pass. Total: 364 tests + 2 builds.

---

## Phase B: On-Chain Program (Devnet)

Test every allocator instruction on devnet.

### Basic Operations

- [ ] **B1.** Program deployed and verified
  ```
  Program: 2QtJ5kmxLuW2jYCFpJMtzZ7PCnKdoMwkeueYoDUi5z5P
  Verified: solana program show <ID> --url devnet
  ```

- [ ] **B2.** Allocator initialized (admin + keeper authority)
  ```
  Allocator PDA: 77qDPumzyvknJok8fQ1mhgku6xSXYuAmtoBxokUBJwBE
  Admin: FGSkt8MwXH83daNNW8ZkoqhL1KLcLoZLcdGJz84BWWr
  Keeper: 2xRNkCNNbEhr7iDsUdZ252LvAtcHFXUNmpSAM7ad6eyk
  ```

- [ ] **B3.** Treasury initialized with USDC token account
- [ ] **B4.** Moderate vault initialized (risk_level=1, deposit_cap=100 USDC)
- [ ] **B5.** Aggressive vault initialized (risk_level=2, deposit_cap=100 USDC)
- [ ] **B6.** Drift User account initialized (owned by allocator PDA)

### Deposit Flow

- [ ] **B7.** Deposit 10 USDC into moderate vault → shares minted correctly
  - Verify: `shares = amount * total_shares / total_assets` (or 1:1 for first deposit)
  - Verify: vault `total_shares` and `total_assets` updated
  - Verify: allocator `total_tvl` updated
  - tx: _______________

- [ ] **B8.** Deposit 20 USDC into moderate vault (second deposit) → share price maintained
  - Verify: shares received = `20 * total_shares / total_assets`
  - Verify: share price unchanged from first deposit
  - tx: _______________

- [ ] **B9.** Deposit into aggressive vault → separate share mint works
  - tx: _______________

- [ ] **B10.** Deposit exceeds cap → correctly rejected with `DepositCapExceeded`
  - Attempt: deposit 200 USDC (cap is 100)
  - Expected: transaction fails
  - tx: _______________

- [ ] **B11.** Deposit while halted → correctly rejected with `AllocatorHalted`
  - tx: _______________

### Withdrawal Flow

- [ ] **B12.** Request withdrawal → pending_withdrawal_shares set
  - Verify: `request_time_share_price` recorded
  - Verify: cannot request again (`HasPendingWithdrawal`)
  - tx: _______________

- [ ] **B13.** Withdraw before redemption period → rejected (`RedemptionPeriodNotElapsed`)
  - tx: _______________

- [ ] **B14.** Withdraw after redemption (via emergency halt bypass) → USDC returned
  - Verify: shares burned
  - Verify: USDC amount = shares × worse_of(request_price, current_price)
  - Verify: performance fee deducted (if gains above HWM)
  - Verify: vault totals updated
  - tx: _______________

- [ ] **B15.** Full withdrawal (all shares) → position zeroed out
  - Verify: user position shares = 0
  - Verify: pending_withdrawal cleared
  - tx: _______________

### Guardrails & Admin

- [ ] **B16.** Emergency halt → deposits blocked, resume works
  - tx halt: _______________
  - tx resume: _______________

- [ ] **B17.** Update deposit cap → new cap enforced
  - Change cap from 100 to 500 USDC
  - Verify: deposit of 200 USDC now succeeds
  - tx: _______________

- [ ] **B18.** Update keeper authority → old key rejected, new key works
  - tx: _______________

- [ ] **B19.** Rebalance with valid weights → accepted, record written
  - Propose weights that sum to 10000 bps
  - Verify: RebalanceRecord created
  - tx: _______________

- [ ] **B20.** Rebalance with invalid weights → rejected
  - Weights sum ≠ 10000 → `InvalidWeightSum`
  - Weight exceeds max → `WeightExceedsMax`
  - Shift > 20% → `ShiftTooLarge`
  - Too soon → `RebalanceTooSoon`

### Drift CPI

- [ ] **B21.** `allocate_to_drift` → USDC moves from vault_usdc to Drift
  - Requires Drift devnet USDC
  - tx: _______________

- [ ] **B22.** `recall_from_drift` → USDC moves from Drift back to vault_usdc
  - tx: _______________

**Note:** B21-B22 require Drift devnet USDC. Can be deferred if Drift faucet is unavailable — the CPI code is verified by anchor build + basic devnet test.

---

## Phase C: Keeper Bot (Devnet)

Test the keeper running with real Drift data on devnet.

### Connection & Boot

- [ ] **C1.** Keeper boots with DriftClient connected to devnet
  ```bash
  cd ~/local-dev/nanuqfi-keeper
  DRIFT_RPC_URL=https://api.devnet.solana.com \
  KEEPER_WALLET_PATH=~/Documents/secret/nanuqfi-keeper.json \
  DRIFT_ENV=devnet \
  npx tsx src/index.ts
  ```
  Verify: logs show "subscribed to Drift" or similar

- [ ] **C2.** Keeper runs 3 consecutive cycles without error
  - Verify: no crash, no timeout
  - Verify: decisions logged for each cycle

- [ ] **C3.** Health endpoint returns valid data
  ```bash
  curl http://localhost:3000/health
  ```

### Algorithm Engine (Real Data)

- [ ] **C4.** Keeper fetches real lending rate from Drift Data API
  ```bash
  curl http://localhost:3000/v1/yields
  ```
  Verify: `usdcLendingRate` > 0

- [ ] **C5.** Keeper fetches real funding rates from Drift Data API
  Verify: `solFundingRate` has a value (positive or negative)

- [ ] **C6.** Algorithm engine proposes weights based on real data
  ```bash
  curl http://localhost:3000/v1/decisions
  ```
  Verify: `proposal.weights` has entries, sum = 10000

- [ ] **C7.** Auto-exit triggers correctly when funding is negative
  - If current funding is negative → basis trade should have 0 weight or be excluded
  - Check in decisions: `excludedBackends` contains 'drift-basis'

### DeFi Yield Scanner

- [ ] **C8.** Market scan returns Solana yield opportunities
  ```bash
  curl http://localhost:3000/v1/market-scan
  ```
  Verify: `opportunities` array has entries from DeFi Llama

- [ ] **C9.** Drift comparison shows rank vs market
  Verify: `driftComparison.totalScanned` > 0
  Verify: `driftComparison.driftRank` is a number

- [ ] **C10.** Scanner handles API failures gracefully
  - Disconnect network briefly → scanner returns empty, no crash

### REST API (All Endpoints)

- [ ] **C11.** `GET /health` — heartbeat, uptime, status
- [ ] **C12.** `GET /v1/vaults` — vault states (may be empty without on-chain connection)
- [ ] **C13.** `GET /v1/yields` — current yield data
- [ ] **C14.** `GET /v1/decisions` — keeper decisions with weights
- [ ] **C15.** `GET /v1/market-scan` — DeFi yield scan
- [ ] **C16.** `GET /v1/status` — keeper status info

### Stress & Edge Cases

- [ ] **C17.** Keeper runs for 1 hour continuously without crash
- [ ] **C18.** Keeper handles RPC timeout gracefully (no hang)
- [ ] **C19.** Keeper recovers after Drift Data API returns error
- [ ] **C20.** Multiple rapid cycles (reduce interval to 10s) — no race conditions

---

## Phase D: Frontend (Devnet)

Test the frontend connecting to devnet allocator and keeper.

### Wallet & Connection

- [ ] **D1.** Frontend loads at `localhost:3000` with devnet RPC
  ```bash
  cd ~/local-dev/nanuqfi-app
  NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com \
  NEXT_PUBLIC_ALLOCATOR_PROGRAM_ID=2QtJ5kmxLuW2jYCFpJMtzZ7PCnKdoMwkeueYoDUi5z5P \
  pnpm dev
  ```

- [ ] **D2.** Wallet connect button shows in nav (Phantom/Solflare)
- [ ] **D3.** Connecting wallet shows wallet address
- [ ] **D4.** Disconnecting wallet returns to "Connect" state
- [ ] **D5.** Wrong network → shows network mismatch warning (if implemented)

### Dashboard

- [ ] **D6.** Dashboard shows real TVL from on-chain allocator PDA
- [ ] **D7.** Dashboard shows vault cards for moderate + aggressive
- [ ] **D8.** Loading skeletons show while data loads
- [ ] **D9.** Keeper health status displayed (or "unavailable" if keeper not running)

### Vault Detail + Deposit

- [ ] **D10.** Vault detail page shows real on-chain data (TVL, shares, price)
- [ ] **D11.** USDC balance shows when wallet connected
- [ ] **D12.** Deposit form accepts amount input
- [ ] **D13.** Deposit transaction: wallet prompts to sign
- [ ] **D14.** Deposit success: balance updates, shares show
- [ ] **D15.** Deposit failure: human-readable error shown (not raw hex)

### Withdrawal

- [ ] **D16.** Request withdrawal button works (when user has shares)
- [ ] **D17.** Withdrawal countdown shows after request
- [ ] **D18.** Complete withdrawal button appears after redemption
- [ ] **D19.** Withdrawal success: USDC returned, shares zeroed

### Activity Page

- [ ] **D20.** Activity page shows keeper decisions (from keeper API)
- [ ] **D21.** "Keeper unavailable" banner when API unreachable
- [ ] **D22.** Decisions show AI involvement badges

### Edge Cases

- [ ] **D23.** Page refresh preserves wallet connection
- [ ] **D24.** Deposit with zero amount → disabled button
- [ ] **D25.** Deposit without wallet → shows "Connect wallet" prompt
- [ ] **D26.** Multiple vault positions visible simultaneously

---

## Phase E: Infrastructure (VPS + Deploy)

Test the deploy pipeline and VPS operations.

### Docker

- [ ] **E1.** Keeper Docker image builds locally
  ```bash
  cd ~/local-dev/nanuqfi-keeper && docker build -t nanuqfi-keeper .
  ```

- [ ] **E2.** App Docker image builds locally
  ```bash
  cd ~/local-dev/nanuqfi-app && docker build -t nanuqfi-app .
  ```

- [ ] **E3.** Keeper container runs locally with devnet config
  ```bash
  docker run --rm -e DRIFT_RPC_URL=https://api.devnet.solana.com -e DRIFT_ENV=devnet nanuqfi-keeper
  ```

- [ ] **E4.** App container runs locally
  ```bash
  docker run --rm -p 3000:3000 nanuqfi-app
  ```

### VPS Deploy

- [ ] **E5.** SSH to nanuqfi user works: `ssh nanuqfi "whoami"`
- [ ] **E6.** Docker available for nanuqfi user: `ssh nanuqfi "docker ps"`
- [ ] **E7.** GHCR pull works: `ssh nanuqfi "docker pull ghcr.io/nanuqfi/nanuqfi-keeper:latest"` (after first push)

### CI/CD

- [ ] **E8.** Push to `nanuqfi/nanuqfi` main → CI tests pass on GitHub Actions
- [ ] **E9.** Push to `nanuqfi/nanuqfi-keeper` main → Docker build + deploy to VPS
- [ ] **E10.** Push to `nanuqfi/nanuqfi-app` main → Docker build + deploy to VPS

### DNS & SSL

- [ ] **E11.** `app.nanuqfi.com` resolves to VPS: `dig app.nanuqfi.com +short` → 151.245.137.75
- [ ] **E12.** `keeper.nanuqfi.com` resolves to VPS
- [ ] **E13.** HTTPS works: `curl -s https://keeper.nanuqfi.com/health` (502 expected until container runs)
- [ ] **E14.** SSL cert valid: `echo | openssl s_client -connect app.nanuqfi.com:443 2>/dev/null | head -5`

### Live VPS (After Deploy)

- [ ] **E15.** Keeper container running on VPS: `ssh nanuqfi "docker ps | grep keeper"`
- [ ] **E16.** App container running on VPS: `ssh nanuqfi "docker ps | grep app"`
- [ ] **E17.** `https://keeper.nanuqfi.com/health` returns valid JSON
- [ ] **E18.** `https://app.nanuqfi.com` loads the NanuqFi dashboard
- [ ] **E19.** `docker image prune -f` ran after deploy (no dangling images)
- [ ] **E20.** Keeper logs show cycles running: `ssh nanuqfi "docker logs nanuqfi-keeper --tail 20"`

---

## Phase F: End-to-End Integration (All Systems Together)

Everything running together on devnet.

### Full Flow

- [ ] **F1.** Keeper running on VPS with devnet Drift connection
- [ ] **F2.** Frontend at `app.nanuqfi.com` connected to devnet
- [ ] **F3.** Connect Phantom wallet (devnet) on frontend
- [ ] **F4.** Deposit USDC via frontend → shares appear in vault detail
- [ ] **F5.** Keeper cycle runs → decisions visible in activity page
- [ ] **F6.** Market scan results visible in frontend
- [ ] **F7.** Request withdrawal via frontend → countdown shows
- [ ] **F8.** Complete withdrawal → USDC returned to wallet
- [ ] **F9.** Emergency halt (via script) → frontend shows "halted" banner
- [ ] **F10.** Resume → frontend returns to normal

### Monitoring

- [ ] **F11.** UptimeRobot or similar pinging `keeper.nanuqfi.com/health`
- [ ] **F12.** Keeper runs 24h without crash on VPS
- [ ] **F13.** No memory leak: `docker stats nanuqfi-keeper` shows stable RSS

---

## Summary Tracker

| Phase | Tests | Passed | Status |
|---|---|---|---|
| A: Unit & Integration | 6 | /6 | |
| B: On-Chain Program | 22 | /22 | |
| C: Keeper Bot | 20 | /20 | |
| D: Frontend | 26 | /26 | |
| E: Infrastructure | 20 | /20 | |
| F: End-to-End | 13 | /13 | |
| **Total** | **107** | **/107** | |

**Mainnet gate:** ALL 107 tests must pass before mainnet deployment.

---

## Already Completed

From previous E2E gate script (`scripts/e2e-gate.ts` — 10/10 passed):
- B1, B2, B3, B4, B5, B6 ✓ (program + accounts initialized)
- B7 ✓ (deposit 10 USDC)
- B12 ✓ (request withdrawal)
- B14 ✓ (complete withdrawal via halt bypass)
- B16 ✓ (emergency halt + resume)

These should be re-verified during the full test run but are known to work.

---

**Last Updated:** 2026-03-16
