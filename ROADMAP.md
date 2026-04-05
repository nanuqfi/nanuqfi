# NanuqFi Roadmap

## Vision

**Endgame:** The yield routing layer for DeFi. Users deposit, pick risk, protocol routes capital to the best risk-adjusted yield across any protocol, any strategy, any chain.

**Approach:** Build → Ship → Integrate → Expand. Ship fast with quality gates, don't optimize prematurely.

---

## Phase 1: Hackathon MVP (March 15 - April 6, 2026)

**Target:** Ranger Build-A-Bear Hackathon (Main Track + Drift Side Track)

### Build (COMPLETE)
- [x] Core SDK (`@nanuqfi/core`) — interfaces, registry, router, strategy, circuit breaker
- [x] On-chain allocator program — 14 instructions, full guardrail suite
- [x] Backend Drift — 5 yield backends with auto-exit triggers
- [x] AI Keeper — algorithm engine, Claude AI reasoning, REST API, health monitor
- [x] Frontend — custom components, dark mode, transparency UI

### Integrate (COMPLETE)
- [x] Drift SDK integration — real CPI calls via allocate_to_drift/recall_from_drift
- [x] Anchor integration tests on devnet — e2e-gate 9/10 passing
- [x] Wallet connect in frontend (Solana wallet adapter)
- [x] Deploy allocator to devnet — `2QtJ5kmxLuW2jYCFpJMtzZ7PCnKdoMwkeueYoDUi5z5P`
- [x] Deploy keeper to VPS (Docker) — keeper.nanuqfi.com live
- [x] Deploy frontend — app.nanuqfi.com live
- [x] Deploy marketing site — nanuqfi.com live
- [x] CI/CD (GitHub Actions for all 4 repos → GHCR → VPS auto-deploy)

### Advanced Features (COMPLETE)
- [x] AI regime detection (trend/range/stress) with per-strategy multipliers
- [x] Market scan integration — opportunity cost penalty from 50+ DeFi protocols
- [x] Correlation-aware position sizing (perp concentration cap)
- [x] Oracle divergence guard + predictive funding slope auto-exit
- [x] On-chain rebalance submission from keeper
- [x] Telegram alerts for failures + stress regime
- [x] Second protocol backend (Marginfi stub) — protocol-agnostic proof
- [x] On-chain rebalance audit viewer in dashboard
- [x] Scanner-driven yield opportunity alerts in UI

### Submit (April 6)
- [ ] Demo video (3 min max)
- [ ] Tweet via X API
- [ ] Strategy doc update

---

## Phase 2: Production Hardening (April - May 2026)

- [ ] Security review of allocator program
- [ ] Upgrade authority → Squads multisig
- [ ] Real devnet testing with live Drift vaults
- [x] Keeper monitoring (Telegram alerts live, UptimeRobot pending)
- [ ] Mainnet deployment
- [ ] First depositors (seed TVL from hackathon win)

---

## Phase 3: Protocol Expansion (Q3-Q4 2026)

- [x] Marginfi backend stub (mock yields, implements YieldBackend interface)
- [ ] Additional backends: Mango, Kamino (just implement YieldBackend)
- [ ] Multi-asset vaults (beyond USDC)
- [x] Adaptive regime strategy — AI classifies trend/range/stress with per-strategy multipliers
- [ ] Custom ML models for alpha generation (Python microservice — open nuance)
- [ ] Cross-chain yield routing (Hyperliquid, Arbitrum perps)

---

## Phase 4: Protocol Maturity (2027+)

- [ ] Governance token / DAO
- [ ] Third-party strategy providers (plug into allocator)
- [ ] Institutional-grade reporting and compliance
- [ ] Multi-foundation grants (Drift, Mango, Solana Foundation)

---

## Open Nuances

Decisions deferred intentionally. Architecture supports all options.

| Nuance | Current | Future option |
|---|---|---|
| AI models | Cloud API (Claude) | Custom ML trained on market data |
| On-chain allocator | Drift-specific CPI | Multi-protocol router program |
| Chains | Solana only | Cross-chain via Wormhole/bridges |
