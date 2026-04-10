# NanuqFi Roadmap

## Vision

**Endgame:** The yield routing layer for DeFi. Users deposit, pick risk, protocol routes capital to the best risk-adjusted yield across any protocol, any strategy, any chain.

**Approach:** Build → Ship → Integrate → Expand. Ship fast with quality gates, don't optimize prematurely.

---

## Phase 1: Hackathon MVP (March 15 - April 6, 2026)

**Target:** Ranger Build-A-Bear Hackathon (Main Track)

### Build (COMPLETE)
- [x] Core SDK (`@nanuqfi/core`) — interfaces, registry, router, strategy, circuit breaker, fetchWithRetry, Logger, TtlCache
- [x] On-chain allocator program — 27 instructions, full guardrail suite + production hardening
- [x] AI Keeper — algorithm engine, Claude AI reasoning, REST API, health monitor
- [x] Frontend — custom components, dark mode, transparency UI

### Integrate (COMPLETE)
- [x] Anchor integration tests on devnet — e2e-gate passing
- [x] Wallet connect in frontend (Solana wallet adapter)
- [x] Deploy allocator to devnet — `2QtJ5kmxLuW2jYCFpJMtzZ7PCnKdoMwkeueYoDUi5z5P`
- [x] Deploy keeper to VPS (Docker) — keeper.nanuqfi.com live
- [x] Deploy frontend — app.nanuqfi.com live
- [x] Deploy marketing site — nanuqfi.com live
- [x] CI/CD (GitHub Actions for all 4 repos → GHCR → VPS auto-deploy)
- [x] CI pipeline: build + lint + test + npm audit + cargo audit on every push/PR

### Advanced Features (COMPLETE)
- [x] AI regime detection (trend/range/stress) with per-strategy multipliers
- [x] Market scan integration — opportunity cost penalty from DeFi protocols
- [x] Correlation-aware position sizing (concentration cap)
- [x] On-chain rebalance submission from keeper
- [x] Telegram alerts for failures + stress regime
- [x] On-chain rebalance audit viewer in dashboard
- [x] Scanner-driven yield opportunity alerts in UI

### Drift Pivot (COMPLETE — April 1-6, 2026)
- [x] Drift hacked $285M on 2026-04-01 — fully removed from codebase
- [x] `@nanuqfi/backend-marginfi` — real MarginFi SDK integration, live mainnet rates
- [x] `@nanuqfi/backend-kamino` — zero-dep REST API, 21K+ historical data points
- [x] `@nanuqfi/backend-lulo` — Lulo aggregator (Kamino/MarginFi/Jupiter routing)
- [x] `@nanuqfi/backtest` — historical simulation engine (2.5 years, Sharpe/Sortino/CAGR)
- [x] Keeper pivot — algorithm engine updated for kamino/marginfi/lulo strategies
- [x] `/v1/backtest` endpoint — serves historical performance proof
- [x] Allocator program — `allocate_to_protocol` / `recall_from_protocol` (generic, not Drift-specific)

### Production Hardening + Full Security Audit (COMPLETE — 49/49 issues closed)
- [x] All P0-critical: token constraints on all user/protocol accounts, devnet feature gate, RPC key proxy, share price math, await rebalance
- [x] All critical: real on-chain addresses for rebalance, per-vault PDA counter, live Marginfi rates
- [x] All high: security headers (app + keeper), API rate limiting, error boundaries, catch block logging
- [x] All P1-hardening: program ID reconciliation, input validation, USDC mint alignment, confirmTransaction fix, Tailwind static classes, network validation, SIGINT handler, config validation, AI strategy validation, alert throttling, Docker hardening, AbortController wiring
- [x] All P2-cleanup: TtlCache bounds, share price dedup, Anchor tests, dead code removal, backtest tests, keypair validation, structured logging, metrics endpoint, fallback alerting, sitemap/robots/OG, accessibility, error reporting, RPC dedup
- [x] 756 tests across ecosystem (337 core + 322 keeper + 97 frontend)
- [x] 0 open issues across all repos

### Submit (April 17)
- [ ] Demo video (3 min max)
- [ ] Tweet via X API
- [x] Strategy doc at nanuqfi.com/strategy
- [x] README.md synced for all repos

---

## Phase 2: Mainnet Readiness (April - May 2026)

- [x] Full security audit — 49/49 issues resolved across 3 repos
- [x] Token account constraints — all user/protocol token accounts validated
- [x] Error handling hardening — error boundaries, catch logging, graceful shutdown
- [x] API security — headers, rate limiting, CORS, config validation
- [x] Keeper monitoring — Telegram alerts, throttling, structured logging, /v1/metrics
- [ ] External security review of allocator program (third-party audit)
- [ ] Upgrade authority → Squads multisig
- [ ] Real devnet testing with live Marginfi/Kamino/Lulo vaults
- [ ] Mainnet deployment
- [ ] First depositors (seed TVL)

---

## Phase 3: Protocol Expansion (Q3-Q4 2026)

- [x] Marginfi backend — real SDK integration, live rates
- [x] Kamino backend — zero-dep REST API, historical data
- [x] Lulo backend — aggregator over Kamino/MarginFi/Jupiter
- [x] Backtest engine — historical simulation over 2.5 years
- [ ] Additional backends: Mango, Meteora, Orca
- [ ] Multi-asset vaults (beyond USDC)
- [x] Adaptive regime strategy — AI classifies trend/range/stress with per-strategy multipliers
- [ ] Custom ML models for alpha generation (Python microservice — open nuance)
- [ ] Cross-chain yield routing (Hyperliquid, Arbitrum perps)

---

## Phase 4: Protocol Maturity (2027+)

- [ ] Governance token / DAO
- [ ] Third-party strategy providers (plug into allocator)
- [ ] Institutional-grade reporting and compliance
- [ ] Multi-foundation grants (Solana Foundation, Marginfi, Kamino)

---

## Open Nuances

Decisions deferred intentionally. Architecture supports all options.

| Nuance | Current | Future option |
|---|---|---|
| AI models | Cloud API (Claude) | Custom ML trained on market data |
| On-chain allocator | Generic protocol alloc/recall instructions | Multi-protocol router program |
| Chains | Solana only | Cross-chain via Wormhole/bridges |
