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

### Integrate (IN PROGRESS)
- [ ] Drift SDK integration — replace mock mode with real CPI calls
- [ ] Anchor integration tests on devnet
- [ ] Wallet connect in frontend (Solana wallet adapter)
- [ ] Deploy allocator to devnet
- [ ] Deploy keeper to VPS (Docker)
- [ ] Deploy frontend to Vercel
- [ ] CI/CD (GitHub Actions for all 3 repos)

### Submit (April 6)
- [ ] Strategy documentation (thesis, mechanics, risk management)
- [ ] Demo video (3 min max)
- [ ] On-chain vault address for verification

---

## Phase 2: Production Hardening (April - May 2026)

- [ ] Security review of allocator program
- [ ] Upgrade authority → Squads multisig
- [ ] Real devnet testing with live Drift vaults
- [ ] Keeper monitoring (Telegram alerts, UptimeRobot)
- [ ] Mainnet deployment
- [ ] First depositors (seed TVL from hackathon win)

---

## Phase 3: Protocol Expansion (Q3-Q4 2026)

- [ ] Additional backends: Mango, Marginfi, Kamino (just implement YieldBackend)
- [ ] Multi-asset vaults (beyond USDC)
- [ ] Approach 3 evolution: adaptive regime strategy (AI classifies market regime)
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
