# NanuqFi Comprehensive Test Coverage Design

**Date:** 2026-04-07
**Status:** Approved
**Scope:** Core monorepo (`nanuqfi/nanuqfi`)

---

## Problem

The core monorepo has 139 tests across 5 TypeScript packages — all passing, all unit-test focused. But significant gaps exist:

1. **Anchor program (27 instructions)** — zero Rust unit tests, zero CI-integrated integration tests
2. **Backend error paths** — mock-mode happy paths covered, real-mode failures untested (network, malformed data, rate limiting, stale cache)
3. **Cross-package integration** — no test validates the full router → backend → strategy flow or failure cascades
4. **CI pipeline** — only unit tests run; integration tests exist but are skipped; `test:int` script is a no-op
5. **Cargo warnings** — 34 `unexpected cfg` warnings from Anchor/Solana macros pollute build output
6. **Legacy scripts** — `test-phase-b.ts`, `test-phase-c.ts`, `e2e-gate.ts` cover on-chain flows but aren't in CI

**Target:** All gaps closed, zero cargo warnings, CI runs both unit and integration tests.

---

## Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Anchor test strategy | **Both** — Rust unit tests for validation logic + TypeScript Vitest integration tests for instruction flows |
| CI execution environment | **Hybrid** — local `solana-test-validator` for program tests, live APIs (Kamino/Marginfi/Lulo) for backend integration |
| Legacy scripts | **Supersede** — archive to `scripts/legacy/`, new tests are source of truth |
| Cross-package scope | **Full flow + failure cascades** — lifecycle flow, circuit breaker trips, stale data, anomalous rates, multi-backend failure |
| Worktree | Yes — isolated worktree branch for all test work |

---

## 1. Anchor Program — Rust Unit Tests

### Location
`programs/allocator/src/tests/` — one module per concern, re-exported from `mod.rs`.

### Test Modules

**`validation.rs`** — weight and guardrail validation:
- Invalid weight sum (not equal to 100%)
- Weight exceeds max per-protocol limit
- Negative weight rejection
- Deposit below minimum
- Deposit exceeds per-transaction limit
- Deposit exceeds vault capacity

**`auth.rs`** — authorization guards:
- Unauthorized keeper rejected
- Unauthorized admin rejected
- Correct keeper passes
- Correct admin passes
- Keeper authority update (old key rejected after change)

**`state.rs`** — account state logic:
- Risk level enum validation (conservative/moderate/aggressive)
- Rebalance cooldown enforcement (too soon rejection)
- Shift-too-large rejection
- Halt state blocks deposits/withdrawals/rebalances
- Resume clears halt state
- Redemption period enforcement
- Pending withdrawal state machine

**`arithmetic.rs`** — math safety:
- Overflow on large deposit amounts
- Underflow on withdrawal exceeding balance
- Division-by-zero guards (zero TVL scenarios)
- Basis points conversion accuracy

**`whitelist.rs`** — protocol whitelist:
- Add protocol succeeds
- Duplicate add rejected
- Remove protocol succeeds
- Remove non-existent protocol rejected
- Whitelist full rejection
- Non-whitelisted protocol blocked from allocation

**`serialization.rs`** — account struct serde:
- Allocator, RiskVault, UserPosition, RebalanceRecord round-trip
- Version field preserved across serialization

### Estimated count: ~30 tests

---

## 2. Anchor Program — TypeScript Integration Tests

### Location
`programs/allocator/tests/` — Vitest suite, runs against `solana-test-validator`.

### Setup
- `beforeAll`: start local validator, deploy program, create test accounts (admin, keeper, user wallets, USDC mint)
- `afterAll`: stop validator, cleanup
- Each `describe` block gets its own allocator + vault state to avoid test coupling

### Test Flows

**`lifecycle.test.ts`** — happy path:
- Initialize allocator → initialize risk vault → initialize treasury
- User deposits USDC → verify position created, vault balance updated
- Keeper rebalances → verify weights applied, event emitted
- Allocate to protocol → verify protocol balance updated
- Recall from protocol → verify funds returned
- User requests withdrawal → redemption period passes → user withdraws → verify balance

**`admin.test.ts`** — admin operations:
- Update deposit cap → larger deposit succeeds
- Update keeper authority → old keeper rejected, new keeper works
- Update guardrails → new limits enforced
- Emergency halt → all operations blocked → resume → operations work
- Close user position (zero balance) → account reclaimed
- Close rebalance record → account reclaimed

**`whitelist.test.ts`** — protocol management:
- Add whitelisted protocol → allocate succeeds
- Remove protocol → allocate rejected
- Non-whitelisted protocol → allocate rejected

**`errors.test.ts`** — negative paths:
- Deposit to halted vault → error
- Withdraw without pending request → error
- Rebalance too soon → error
- Unauthorized keeper → error
- Deposit exceeds cap → error

### Estimated count: ~15 tests

---

## 3. Backend Error Path Tests

### Location
Added to each backend's existing test directory: `src/backends/lending.error.test.ts` and `src/utils/*.error.test.ts`.

### Scenarios (applied to all 3 backends — Marginfi, Kamino, Lulo)

**Network failures** (per backend: ~3 tests):
- `fetchWithRetry` throws on connection refused → backend surfaces actionable error
- Request timeout (AbortController fires) → error includes timeout context
- DNS resolution failure → error not silently swallowed

**Malformed responses** (per backend: ~3 tests):
- API returns 200 with invalid JSON → parse error caught
- API returns valid JSON but missing required fields (APY, TVL) → validation rejects
- API returns NaN/negative/Infinity rates → sanitized or rejected before propagation

**Rate limiting** (per backend: ~2 tests):
- 429 response → retry logic fires, circuit breaker records failure
- Sustained 429s → circuit breaker trips to OPEN, backend reports unavailable

**Cache behavior** (per backend: ~2 tests):
- Cache expired, refresh fails → stale-while-revalidate serves last known value
- Cache empty, first fetch fails → error propagated (no stale data to serve)

**Initialization failures** (per backend: ~2 tests):
- Real mode without required client/config → meaningful error on construction
- Missing API key (Lulo: `LULO_API_KEY`) → error at initialization, not at first request

### Estimated count: ~25 tests (8-9 per backend × 3 backends, some shared patterns)

---

## 4. Cross-Package Integration Tests

### Location
`packages/core/src/integration/cross-package.test.ts` — imports from all backend packages.

### Full Lifecycle Flow (~4 tests)
1. Register Marginfi + Kamino + Lulo backends (mock mode) → router ranks by risk-adjusted yield → verify ranking order matches expected APY/risk
2. Router selects best backend → strategy produces weights → guardrail validation passes → weights sum to 100%
3. Strategy for each risk level (conservative/moderate/aggressive) → verify different weight distributions
4. Router with real historical data (backtest engine) → verify consistent scoring over time

### Failure Cascades (~8 tests)
5. One backend throws on `getYield()` → circuit breaker trips → router excludes it → remaining 2 backends still serve valid allocation
6. Two backends fail → router operates on single backend → weights adjusted
7. All backends fail → router returns error state, does not produce allocation
8. Backend returns anomalous rate (100% APY) → sanity check catches outlier → excluded from ranking
9. Backend returns stale data (cache hit, refresh failed) → router uses stale with degraded confidence score
10. Circuit breaker in HALF_OPEN → one success → transitions to CLOSED → backend re-included
11. Circuit breaker in HALF_OPEN → failure → back to OPEN → backend stays excluded
12. Rapid backend oscillation (up/down/up) → circuit breaker dampens, doesn't flap

### Estimated count: ~12 tests

---

## 5. Zero Cargo Warnings

### Fix
Add to `programs/allocator/Cargo.toml`:

```toml
[lints.rust]
unexpected_cfgs = { level = "allow", check-cfg = [
  'cfg(feature, values("anchor-debug", "custom-heap", "custom-panic"))',
  'cfg(target_os, values("solana"))',
] }
```

### Enforcement
CI runs `cargo build` and `cargo test` with `RUSTFLAGS="-D warnings"` — any warning is a build failure.

---

## 6. CI Pipeline Changes

### `.github/workflows/ci.yml` updates

**Existing `test` job** (unchanged):
- `pnpm turbo test` — unit tests only, fast

**New `cargo-test` job**:
- `cargo build` + `cargo test` with `-D warnings`
- Runs on every push/PR
- No external dependencies

**New `integration-test` job**:
- Runs after `test` and `cargo-test` jobs pass (dependency)
- Gated to `main` branch + PRs only (saves CI minutes on feature branches)
- Steps:
  1. Install Solana CLI + `solana-test-validator`
  2. Build and deploy Anchor program to local validator
  3. Run `pnpm turbo test:int` — all integration tests
- Environment: `KAMINO_INTEGRATION=1`, `MARGINFI_INTEGRATION=1`, `LULO_INTEGRATION=1`, `LULO_API_KEY` (from GitHub secrets)

### Package `test:int` scripts
Each package gets a `test:int` script in `package.json`:
- `core`: runs `src/integration/cross-package.test.ts`
- `backend-marginfi`: runs `src/integration/mainnet.test.ts`
- `backend-kamino`: runs `src/integration/mainnet.test.ts`
- `backend-lulo`: runs `src/integration/mainnet.test.ts`
- `backtest`: runs `src/integration/backtest.test.ts`
- Root `allocator` tests: separate vitest config pointing at `programs/allocator/tests/`

---

## 7. Legacy Script Archival

Move to `scripts/legacy/`:
- `scripts/test-phase-b.ts` → `scripts/legacy/test-phase-b.ts`
- `scripts/test-phase-c.ts` → `scripts/legacy/test-phase-c.ts`
- `scripts/e2e-gate.ts` → `scripts/legacy/e2e-gate.ts`
- `scripts/test-halt-resume.ts` → `scripts/legacy/test-halt-resume.ts`

Keep `scripts/setup-devnet.ts` and `scripts/fix-treasury-usdc.ts` — these are operational, not test scripts.

---

## Test Count Summary

| Category | Current | New | Total |
|----------|---------|-----|-------|
| Core unit tests | 45 | 0 | 45 |
| Backend-marginfi unit | 24 | ~9 | ~33 |
| Backend-kamino unit | 17 | ~8 | ~25 |
| Backend-lulo unit | 16 | ~8 | ~24 |
| Backtest unit | 21 | 0 | 21 |
| Anchor Rust unit | 1 | ~30 | ~31 |
| Anchor TS integration | 0 | ~15 | ~15 |
| Backend integration (existing) | 16 | 0 | 16 |
| Cross-package integration | 0 | ~12 | ~12 |
| **Total** | **139** | **~82** | **~222** |

---

## Out of Scope

- Keeper tests (206 tests in `nanuqfi-keeper` repo — separate concern)
- Frontend tests (12 tests in `nanuqfi-app` repo)
- Phase C keeper API tests (belong in keeper repo)
- Mainnet E2E gate (operational runbook, not automated test)
- Coverage threshold changes (80/80/70 is adequate)
