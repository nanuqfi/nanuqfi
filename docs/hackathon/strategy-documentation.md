# NanuqFi — Strategy Documentation

> **Ranger Build-A-Bear Hackathon | Main Track + Drift Side Track**
> Protocol-agnostic, AI-powered yield routing layer for DeFi

---

## 1. Strategy Thesis

USDC holders face a fragmented yield landscape: lending rates fluctuate daily, funding rates swing with market regime, and delta-neutral strategies require constant monitoring. Most users either park funds in a single lending pool (leaving yield on the table) or manually rotate between strategies (expensive, error-prone, time-consuming).

**NanuqFi routes capital to the best risk-adjusted yield automatically.** Users deposit USDC, select a risk tier (Moderate or Aggressive), and the protocol handles everything: scanning 50+ protocols for opportunities, allocating across multiple strategies simultaneously, and enforcing on-chain guardrails that cap drawdowns and prevent concentration risk.

The edge: a two-layer keeper system where a deterministic algorithm engine proposes allocations every 10 minutes, and an AI reasoning layer (Claude) validates strategy sustainability every 2 hours. On-chain guardrails enforce limits regardless of what the keeper proposes. Trust the program, not the keeper.

---

## 2. Yield Sources (4 Strategies)

All strategies operate on Drift Protocol via CPI (Cross-Program Invocation) from the on-chain allocator program.

### 2.1 USDC Lending
- **Mechanism:** Deposit USDC into Drift's borrow/lend market
- **Expected APY:** 5-12%
- **Risk:** Minimal (utilization-dependent rate fluctuation)
- **Role:** Base yield layer, always-on allocation for all risk tiers

### 2.2 Basis Trade (Delta-Neutral)
- **Mechanism:** Long SOL spot + short SOL-PERP, capturing funding rate spread
- **Expected APY:** 15-40%
- **Risk:** Funding rate inversion (basis collapse)
- **Auto-exit:** Triggers after 16 consecutive negative funding periods (~4 hours)
- **Role:** Core alpha strategy for both risk tiers

### 2.3 Funding Rate Capture (Directional)
- **Mechanism:** Short SOL-PERP when funding is positive (longs pay shorts)
- **Expected APY:** 20-50%
- **Risk:** Adverse price movement against position
- **Auto-exit:** PnL hits -2% (Moderate) or -5% (Aggressive)
- **Role:** High-conviction opportunistic allocation, Aggressive tier only

### 2.4 JitoSOL Delta-Neutral
- **Mechanism:** Stake SOL via JitoSOL (6-8% staking yield) + short SOL-PERP to hedge price exposure, capturing staking yield + funding spread minus borrow cost
- **Expected APY:** 20-35%
- **Risk:** SOL borrow rate exceeding staking yield (carry inversion)
- **Auto-exit:** Triggers when SOL borrow rate >= JitoSOL yield
- **Role:** Structural yield from staking with hedged downside

---

## 3. Risk Tiers & On-Chain Guardrails

The allocator program enforces guardrails at the instruction level. The keeper cannot exceed these limits even if it wanted to.

| Parameter | Moderate Vault | Aggressive Vault |
|-----------|---------------|-----------------|
| **Max perpetual allocation** | 60% | 70% |
| **Max lending allocation** | 40% | 30% |
| **Max single-strategy concentration** | 20% | No limit |
| **Max drawdown (halt trigger)** | 5% | 10% |
| **Redemption period** | 2 days | 3 days |
| **Max allocation shift per rebalance** | 20% | 20% |
| **Minimum rebalance interval** | 1 hour | 1 hour |

**Global guardrails (all vaults):**
- TVL emergency halt: >15% drop in 24 hours (oracle-verified)
- Management fee: 1% annualized
- Performance fee: 10% above per-user high-water mark
- No deposit/withdrawal fees

---

## 4. Backtest Results

**Period:** 90 days (Jan 1 - Mar 31, 2026)
**Methodology:** Ornstein-Uhlenbeck mean-reversion models calibrated to observed Drift lending rates, funding rates, and JitoSOL yields.

| Metric | Baseline (Lending Only) | Moderate Vault | Aggressive Vault |
|--------|------------------------|----------------|-----------------|
| **APY** | 5.5% | **16.08%** | **19.39%** |
| **90-Day Return** | 1.33% | **3.75%** | **4.47%** |
| **Max Drawdown** | -- | **1.89%** | **3.01%** |
| **Sharpe Ratio** | -- | **2.95** | **1.87** |
| **Win Rate** | -- | 56.67% | 62.22% |

**Key takeaways:**
- Moderate vault delivers **~3x baseline** with a Sharpe ratio of 2.95 (exceptional risk-adjusted returns)
- Aggressive vault delivers **~3.5x baseline** with manageable 3% max drawdown
- Multi-strategy diversification keeps drawdowns below tier limits despite higher returns

---

## 5. Architecture

### Trust Model

```
User deposits USDC
       |
       v
[Allocator Program]  <-- On-chain, auditable, guardrails enforced
       |
       v
[Keeper Bot]  <-- Proposes allocations, CANNOT withdraw user funds
       |
       v
[Drift Protocol]  <-- Executes trades via CPI (keeper = trading delegate only)
```

**Users trust the program, not the keeper.** The keeper can trade within guardrail bounds but cannot move funds to any address other than the allocator PDA. Emergency halt freezes all operations instantly.

### Allocator Program (Anchor/Rust)

- **23 instructions:** deposit, withdraw, rebalance, allocate_to_drift, recall_from_drift, emergency_halt, and 17 more
- **Share token model:** ERC-4626 style (share_price = total_assets / total_shares)
- **Rebalance records:** On-chain audit log (circular buffer, 256 entries per vault) storing previous weights, new weights, and AI reasoning hash
- **Keeper lease:** Mutex pattern ensuring only one keeper operates at a time (acquire_lease + heartbeat)

### AI Keeper (TypeScript)

Two-layer decision system:

1. **Algorithm Engine** (every 10 minutes): Scores each strategy by risk-adjusted return (APY / volatility), allocates proportionally, checks auto-exit triggers, enforces guardrails
2. **AI Advisory Layer** (every 2 hours): Claude analyzes market regime, funding sustainability, and correlation risks. Validates or adjusts algorithm proposals. Rate-limited (10 calls/hour, $5/day advisory budget)

**Graceful degradation:** If the AI layer fails (circuit breaker after 3 consecutive failures, 30s reset), the algorithm engine continues autonomously. If Drift is unreachable, conservative default rates apply.

### DeFi Scanner

- Scans **DeFi Llama** (50+ Solana stablecoin pools, TVL > $100K) and **Drift Data API** (lending rates, funding rates, oracle prices)
- Produces ranked opportunity list per risk tier
- Read-only (never executes trades) — pure intelligence gathering
- 5-second timeout per source, graceful fallback on failure

---

## 6. Technical Scope

| Component | Metric |
|-----------|--------|
| On-chain instructions | 23 |
| Devnet tests passing | 102/107 (95%) |
| Total tests (all repos) | 379 |
| Yield strategies | 4 |
| Protocols scanned | 50+ |
| Open source repos | 4 |
| Keeper uptime | 445+ cycles, 0 failures |

### Repositories

| Repo | Purpose | Link |
|------|---------|------|
| `nanuqfi/nanuqfi` | Core SDK + Anchor program | [github.com/nanuqfi/nanuqfi](https://github.com/nanuqfi/nanuqfi) |
| `nanuqfi/nanuqfi-keeper` | AI keeper bot | [github.com/nanuqfi/nanuqfi-keeper](https://github.com/nanuqfi/nanuqfi-keeper) |
| `nanuqfi/nanuqfi-app` | Dashboard + pitch page | [github.com/nanuqfi/nanuqfi-app](https://github.com/nanuqfi/nanuqfi-app) |
| `nanuqfi/nanuqfi-web` | Marketing site | [github.com/nanuqfi/nanuqfi-web](https://github.com/nanuqfi/nanuqfi-web) |

### Live Links

| Service | URL |
|---------|-----|
| Marketing site | [nanuqfi.com](https://nanuqfi.com) |
| Dashboard + Pitch | [app.nanuqfi.com](https://app.nanuqfi.com) |
| Keeper API | [keeper.nanuqfi.com](https://keeper.nanuqfi.com) |

---

## 7. Fee Structure

| Fee | Amount | Mechanism |
|-----|--------|-----------|
| Management | 1% annualized | Accrued per epoch, deducted from vault NAV |
| Performance | 10% of gains | Per-user high-water mark prevents double-charging |
| Deposit | 0% | Free |
| Withdrawal | 0% | Free (subject to redemption period) |

---

## 8. Mainnet Launch Plan

| Phase | TVL Cap | Duration | Trigger |
|-------|---------|----------|---------|
| Seed | $100/vault ($200 total) | 48 hours minimum | Deploy + initialize |
| Limited | $1,000/vault ($2,000 total) | 1 week minimum | 48h clean operation |
| Open | $10,000/vault ($20,000 total) | Ongoing | 1 week clean + all strategies executed |

Progressive cap increases protect early depositors while building confidence.

---

## 9. Why NanuqFi

1. **Multi-strategy stacking** — not single-pool yield, but optimized allocation across lending, basis, funding, and delta-neutral simultaneously
2. **AI-enhanced, algorithm-enforced** — Claude reasons about market regime; algorithm engine executes deterministically; on-chain program enforces
3. **Trustless by design** — keeper proposes, program enforces. Users trust auditable code, not a bot
4. **Protocol-agnostic SDK** — today Drift, tomorrow Mango, Marginfi, Kamino, cross-chain. The `YieldBackend` interface supports any yield source
5. **Transparent** — every allocation, every decision, every guardrail is visible. Dashboard shows real-time keeper decisions, strategy weights, and historical performance

---

**Program ID:** `2QtJ5kmxLuW2jYCFpJMtzZ7PCnKdoMwkeueYoDUi5z5P`
**Built by:** RECTOR
