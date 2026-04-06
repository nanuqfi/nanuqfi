# NanuqFi Core Monorepo — Production Readiness Report

**Repository**: `nanuqfi/nanuqfi`
**Audit Date**: 2026-04-06
**Auditor**: CIPHER (static analysis, read-only)
**Tech Stack**: TypeScript (5 SDK packages) + Rust/Anchor 0.30.1 (21 on-chain instructions)
**Scope**: Full audit — Security, Environment, Error Handling, Performance, Testing, Infrastructure, Data, Monitoring, Documentation, Legal

---

## Executive Summary

**Overall Score: 58/100** — Significant Work Required

The NanuqFi core monorepo demonstrates **strong engineering fundamentals** — exemplary checked math in Rust (zero `unwrap()`/`panic!()`), production-quality circuit breaker + `Promise.allSettled` patterns, consistent mock/real mode separation, clean dependency graph, and comprehensive 339-test suite across 4 repos.

However, the codebase has **critical gaps that block mainnet deployment**: missing token account validation in the Anchor program (the #1 finding), zero fetch timeouts across all API calls, no ESLint configuration despite being installed, a minimal CI pipeline, no Anchor events for on-chain observability, and no LICENSE file.

**Critical blockers**: 4 findings that must be resolved before any mainnet deployment.

---

## Category Scores

```
Security             ██████░░░░  6/10
Environment Config   ██████░░░░  6/10
Error Handling       █████░░░░░  5/10
Performance          ███████░░░  7/10
Testing & Quality    ██████░░░░  6/10
Infrastructure       █████░░░░░  5/10
Database & Data      █████░░░░░  5/10
Monitoring           ██░░░░░░░░  2/10
Documentation        ████████░░  8/10
Legal & Compliance   ████░░░░░░  4/10
```

---

## Findings by Severity

### CRITICAL (4) — Must Fix Before Production

#### C-1: Missing Token Account Mint/Owner Validation in Anchor Program
**File**: `programs/allocator/src/lib.rs` (lines 972-1017, 1043-1098, 1100-1152, 1351-1383)
**Category**: Security

The `Deposit`, `Withdraw`, `Rebalance`, `AllocateToProtocol`, and `RecallFromProtocol` instructions have NO `constraint` checks on token accounts verifying:
- `user_usdc.mint == USDC_MINT`
- `user_usdc.owner == user.key()`
- `vault_usdc.owner == allocator.key()`

**Attack**: Attacker creates fake mint X, creates matching token accounts, calls `deposit()` — SPL Token transfer succeeds (same mint check only), program mints **real share tokens** backed by worthless tokens.

**Fix**: Add `constraint = user_usdc.mint == allocator.usdc_mint` and `constraint = vault_usdc.owner == allocator.key()` to every token account struct.

---

#### C-2: Zero Timeout/Abort on All Network fetch() Calls
**Files**: `packages/backend-kamino/src/utils/kamino-api.ts:76,109` | `packages/backend-lulo/src/utils/lulo-api.ts:100,132` | `packages/backend-marginfi/src/utils/defillama-api.ts:57` | `packages/backtest/src/data-loader.ts:21`
**Category**: Error Handling

All 6 `fetch()` calls across Kamino, Lulo, DeFi Llama, and backtest have no `AbortController` or timeout. A hung DeFi API blocks the caller indefinitely. In production, this stalls the keeper's scoring loop forever.

**Fix**: Add `AbortController` with 10-15s timeout to every fetch call.

---

#### C-3: No ESLint Configuration Despite Being Installed
**Files**: Root `/` — missing `eslint.config.js`
**Category**: Testing & Quality

Root `package.json` has `eslint ^9` and `@typescript-eslint/*` as devDeps. Every package has `"lint": "eslint src/"`. But zero ESLint config exists anywhere — no `eslint.config.js`, no `.eslintrc.*`. Running `pnpm turbo lint` does nothing.

**Fix**: Create `eslint.config.js` with TypeScript-ESLint flat config. Add `pnpm turbo lint` to CI.

---

#### C-4: Zero Monitoring/Observability in SDK Packages
**Files**: All `packages/*/src/` (non-test)
**Category**: Monitoring

The entire SDK has zero logging statements in production code — no console.log, no logging library, no structured logger. When something fails: no record of which backend was called, no API latency, no cache hits/misses, no circuit breaker state transitions. Combined with zero `#[event]` emissions in the Anchor program, there is no observability at any layer.

**Fix**: Add a lightweight logger interface to `@nanuqfi/core` that backends can use. Add `#[event]` structs + `emit!()` for Deposit, Withdraw, Rebalance, EmergencyHalt, AllocateToProtocol, RecallFromProtocol.

---

### HIGH (8) — Should Fix Before Production

#### H-1: Keeper Can Send Vault Funds to Any Token Account
**File**: `programs/allocator/src/lib.rs:1351-1383`
**Category**: Security

`protocol_usdc` in `AllocateToProtocol` / `RecallFromProtocol` is unconstrained. Compromised keeper key = total fund loss. No on-chain whitelist of approved protocol destinations.

**Fix**: Add PDA-based protocol whitelist or per-allocation maximum.

---

#### H-2: Admin "Devnet Utility" Instructions Ship to Mainnet
**File**: `programs/allocator/src/lib.rs:806-840`
**Category**: Security

`admin_reset_vault`, `admin_set_redemption_period`, `admin_set_rebalance_counter`, `admin_set_tvl` are powerful instructions with no compile-time guard. On mainnet, `admin_reset_vault` would erase all user share records.

**Fix**: Gate behind `#[cfg(feature = "devnet")]` or remove before mainnet deploy.

---

#### H-3: No Anchor Events — Zero On-Chain Observability
**File**: `programs/allocator/src/lib.rs`
**Category**: Data Management

Zero `#[event]` structs, zero `emit!()`. Off-chain indexers cannot subscribe to deposits/withdrawals/rebalances without parsing raw tx logs.

**Fix**: Define events for all state-changing instructions and emit them.

---

#### H-4: No Account Versioning/Migration Strategy
**File**: `programs/allocator/src/state.rs`
**Category**: Data Management

Account structs have no `version: u8` field. If the program is upgraded and layout changes, all existing accounts become undeserializable.

**Fix**: Add version field to all account structs. Plan migration instructions.

---

#### H-5: Hardcoded RPC Endpoints in 6+ Scripts
**Files**: `scripts/e2e-gate.ts:44` | `scripts/setup-devnet.ts:73` | `scripts/fix-treasury-usdc.ts:28` | `scripts/test-phase-b.ts:49` | `scripts/test-halt-resume.ts:26` | `scripts/seed-aggressive.ts:44`
**Category**: Environment

All scripts hardcode `https://api.devnet.solana.com` (rate-limited, 429s) instead of `process.env.SOLANA_RPC_URL`.

**Fix**: Use `process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'`.

---

#### H-6: No Test Coverage Tooling
**Files**: All `package.json` files
**Category**: Testing

No `@vitest/coverage-v8` dependency, no coverage thresholds, no reports. CLAUDE.md mandates 80%+ but there is no way to verify.

**Fix**: Add coverage dependency, configure thresholds in vitest config, add coverage to CI.

---

#### H-7: No Security Scanning in CI
**File**: `.github/workflows/ci.yml`
**Category**: Infrastructure

No `cargo audit`, `pnpm audit`, or SAST. DeFi protocol handling user funds has no automated vulnerability scanning.

**Fix**: Add `pnpm audit --audit-level=high` and `cargo audit` steps to CI.

---

#### H-8: No LICENSE File
**File**: Repository root
**Category**: Legal

No LICENSE file. Code is "all rights reserved" by default. Contributors have no legal clarity. Hackathon judges may flag.

**Fix**: Choose and add appropriate license (MIT/Apache-2.0 for open source, BSL for source-available).

---

### MEDIUM (16) — Important Improvements

| # | Category | Finding | File(s) |
|---|----------|---------|---------|
| M-1 | Security | ERC-4626 first-depositor share inflation/griefing attack | `lib.rs:126-135` |
| M-2 | Security | admin_set_redemption_period bypasses tighten-only guardrail | `lib.rs:831` |
| M-3 | Security | No rate limiting or retry on external API calls | `kamino-api.ts`, `lulo-api.ts`, `defillama-api.ts` |
| M-4 | Security | @mrgnlabs SDK supply chain risk (small org) | `backend-marginfi/package.json` |
| M-5 | Security | No per-transaction deposit maximum | `lib.rs:106-121` |
| M-6 | Security | No account close/rent reclaim mechanism | `lib.rs` (all account types) |
| M-7 | Env | No `.env.example` template | Root `/` |
| M-8 | Error | `Promise.allSettled` silently drops failures — no observability | `core/src/router.ts:35-57` |
| M-9 | Error | Response body `as` assertions — no runtime schema validation | All 6 fetch sites |
| M-10 | Error | Cache doesn't serve stale data on API failure | `kamino-api.ts`, `lulo-api.ts`, `marginfi-data-api.ts` |
| M-11 | Error | Empty array when all backends fail — indistinguishable from "no match" | `core/src/router.ts:55-59` |
| M-12 | Perf | Mixed checked_sub/saturating_sub in financial math | `lib.rs:411,600,786` |
| M-13 | Perf | Singleton caches with no eviction strategy | `marginfi-data-api.ts:37`, `kamino-api.ts:59`, `lulo-api.ts:68` |
| M-14 | Data | RebalanceRecord grows unbounded (~8,760/year/vault) | `lib.rs:1116-1127` |
| M-15 | Docs | No generated API documentation for npm packages | All packages |
| M-16 | Legal | No dependency license audit | Root `/` |

### LOW (13)

| # | Finding |
|---|---------|
| L-1 | Public keys duplicated across 7+ files — rotation requires coordinated update |
| L-2 | Deprecated `setup-drift-user.ts` still in repo |
| L-3 | Broad caret ranges in root devDependencies |
| L-4 | No timeout on fetch() calls (overlaps C-2) |
| L-5 | Error messages may leak HTTP details |
| L-6 | No dev/staging/production config separation (acceptable for SDK) |
| L-7 | Error response body never read from failed HTTP |
| L-8 | No vitest config in 4 of 5 packages |
| L-9 | No pre-commit hooks (husky/lint-staged) |
| L-10 | E2E step 3 still labeled "Drift User" |
| L-11 | No Connection pooling for MarginfiClient |
| L-12 | Rebalance instruction CU budget not measured |
| L-13 | No DeFi risk disclosures |

---

## Positive Findings

These areas are production-quality and should be preserved:

| Area | Detail |
|------|--------|
| Rust safety | Zero `unwrap()`, zero `panic!()`, 100% `checked_*` arithmetic, 22-variant custom error enum |
| Cargo config | `overflow-checks = true`, `lto = "fat"`, `opt-level = 3` in release profile |
| Circuit breaker | Proper CLOSED->OPEN->HALF_OPEN state machine with configurable thresholds |
| Router resilience | `Promise.allSettled` + per-backend circuit breakers — one failure doesn't cascade |
| Two-phase withdrawal | Request + execute with worse-of share pricing — anti-manipulation |
| Mock/real pattern | All 3 backends support `mockMode: true` for offline testing |
| Dependency graph | Clean: core (zero-dep) -> backends -> backtest. No cycles. `workspace:*` |
| TypeScript strict | `strict: true` in tsconfig.base.json, extended by all packages |
| PDA derivation | Deterministic, well-structured seeds, no collisions possible |
| Design docs | 9 design specs + 8 implementation plans in `docs/superpowers/` |
| CLAUDE.md | Comprehensive, current, covers all repos + standards + architecture |
| Test coverage | 137 `it()` calls across 21 test files. Integration tests env-gated |
| Access control | Admin/keeper signer checks on all sensitive instructions |
| Tighten-only guardrails | Caps only decrease, redemption period only increases (with one bypass noted) |

---

## Action Plan

### Day 1 — Critical Security (estimated: 4-6h)
- [ ] **C-1**: Add token account mint/owner constraints to all 5 instructions in `lib.rs`
- [ ] **H-1**: Add protocol whitelist or per-allocation max for keeper
- [ ] **H-2**: Gate devnet utility instructions behind `#[cfg(feature = "devnet")]`
- [ ] **M-1**: Implement virtual offset for first-deposit anti-griefing

### Day 2 — Critical Reliability (estimated: 3-4h)
- [ ] **C-2**: Add `AbortController` timeout to all 6 `fetch()` calls
- [ ] **M-3**: Add exponential backoff retry to API calls
- [ ] **M-10**: Implement stale-while-revalidate cache pattern
- [ ] **M-9**: Add runtime response validation (zod or manual checks)

### Day 3 — CI/CD & Quality (estimated: 3-4h)
- [ ] **C-3**: Create `eslint.config.js` with TypeScript-ESLint rules
- [ ] **H-6**: Add `@vitest/coverage-v8`, configure thresholds (80%+)
- [ ] **H-7**: Add `pnpm audit` and `cargo audit` to CI
- [ ] Update CI to run: lint, type-check, build, test, coverage, audit
- [ ] Add Anchor build to CI

### Day 4 — Observability & Data (estimated: 4-5h)
- [ ] **C-4**: Add logger interface to `@nanuqfi/core`, integrate in backends
- [ ] **H-3**: Define and emit Anchor events for all state-changing instructions
- [ ] **H-4**: Add `version: u8` to all account structs
- [ ] **M-6**: Add close instructions for UserPosition, KeeperLease, RebalanceRecord

### Day 5 — Legal & Polish (estimated: 2-3h)
- [ ] **H-8**: Add LICENSE file
- [ ] **H-5**: Replace hardcoded RPC endpoints with env var + fallback
- [ ] **M-7**: Create `.env.example`
- [ ] **M-8**: Add error reporting callback to router's `allSettled` path
- [ ] Clean up dead Drift code (L-2, L-10)

---

## Production Ready When
- All CRITICAL (4) and HIGH (8) issues resolved
- Score reaches 85+
- Anchor program audited by external security firm
- Squads multisig deployed for admin key
- E2E gate passes on devnet with real funds flow
- Load tested with concurrent deposits/withdrawals

---

*Report generated by CIPHER — NanuqFi Production Readiness Audit*
*Total findings: 4 Critical | 8 High | 16 Medium | 13 Low*
