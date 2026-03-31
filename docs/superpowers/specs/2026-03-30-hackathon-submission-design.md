# NanuqFi Hackathon Submission — Design Spec

**Hackathon:** Ranger Build-A-Bear (Main Track + Drift Side Track)
**Deadline:** April 6, 2026 23:59 UTC (7 days)
**Submission URL:** `https://app.nanuqfi.com/pitch`

---

## Overview

Interactive web pitch deck at `/pitch` in the nanuqfi-app repo. Single scrollable page that serves as the complete hackathon submission — strategy thesis, architecture, backtest results, live proof, and demo links. Judges get one URL that tells the entire story.

No mainnet deployment. Backtested results (accepted per hackathon rules) paired with devnet on-chain proof.

---

## Submission Checklist (Hackathon Requirements)

| Requirement | How We Address It |
|---|---|
| Demo Video (3 min) | Silent screen recording walking through `/pitch` page |
| Strategy Documentation | The pitch page itself — thesis, risk management, architecture |
| Code Repository | GitHub org `nanuqfi/` — add @jakeyvee as collaborator |
| On-chain Verification | Devnet Solscan links (deposit/withdraw/rebalance txs) |
| Backtested Results | 90-day backtest using AlgorithmEngine against Drift historical rates |
| Min 10% APY | Backtest will demonstrate (keeper already shows 18.4%+ for moderate) |
| USDC only | Yes — all vaults are USDC denominated |

---

## Page Structure

Route: `/pitch` in nanuqfi-app (Next.js App Router)
File: `src/app/pitch/page.tsx`

### Section 1: Hero

- Headline: "Yield, Routed."
- Subline: "AI-powered USDC yield routing across Drift Protocol strategies. Transparent allocations, real-time guardrails, autonomous rebalancing."
- Animated counters: backtest APY (moderate + aggressive), protocols scanned, keeper cycles completed
- Subtle gradient background, full viewport height

### Section 2: Problem

- "DeFi yield is fragmented, manual, and opaque"
- 3 pain points as cards:
  - **Fragmented** — yields scattered across protocols, hard to compare
  - **Manual** — rebalancing requires constant monitoring
  - **Opaque** — no transparency into how funds are allocated

### Section 3: Solution

- "One vault. AI-optimized. Fully transparent."
- 3 matching solution cards:
  - **Routed** — capital flows to the best risk-adjusted yield automatically
  - **Autonomous** — keeper bot runs 24/7, algorithm engine + AI reasoning
  - **Transparent** — every decision logged on-chain, visible in the dashboard

### Section 4: Architecture

- Animated flow diagram (SVG or CSS-based):
  - User deposits USDC → Allocator Program (on-chain) → Keeper proposes weights → Algorithm Engine scores strategies → Drift Protocol strategies
- Hover on each node highlights the flow path with a brief explainer tooltip
- Nodes: User, Allocator (Anchor), Keeper (AI), Algorithm Engine, Drift Lending, Drift Basis, Drift Funding, Drift JitoSOL DN

### Section 5: Strategy Engine (Interactive)

- **Risk level toggle**: Moderate / Aggressive buttons
- Switches displayed allocation breakdown (real data from last keeper decision via `/v1/decisions`)
- Weight bars animate between the two risk profiles
- Shows which strategies are included/excluded per risk level
- Auto-exit trigger badges (e.g., "Basis trade: auto-exit if spread < 4bps")

### Section 6: Backtest Results (Interactive)

- **Key metrics row**: APY, Max Drawdown, Sharpe Ratio, Win Rate — animated counters
- **Performance chart**: SVG line chart showing cumulative returns over 90 days
  - Two lines: moderate (sky) + aggressive (emerald)
  - Hover tooltip: date, daily return, cumulative return, drawdown at that point
  - Time period buttons: 30d / 60d / 90d
- **Weight history timeline**: stacked area showing how allocations shifted over the period
- Disclaimer: "Simulated performance based on historical Drift protocol rates. Not indicative of future results."

### Section 7: Live Proof

- Real-time widgets pulling from keeper API (30s poll):
  - **Keeper Status**: uptime, cycles completed, 0 failures (from `/v1/health`)
  - **Current Yields**: lending rate, funding rate, borrow rate, jito yield (from `/v1/yields`)
  - **Last Decision**: risk level, weights, timestamp, "AI Assisted" badge (from `/v1/decisions`)
- "Live" pulse dot badge on each widget
- Stale data handling: if API unreachable, show last known data with "stale" indicator

### Section 8: DeFi Scanner

- Live data from `/v1/market-scan`:
  - Top 5 yield opportunities across Solana DeFi (protocol, asset, APY, TVL, risk)
  - Drift comparison card: Drift rank vs market, best APY comparison
  - "Scanned X protocols" counter
- Reuses the same data already displayed on the Activity page

### Section 9: Judging Criteria Alignment

- 5 cards mapped to hackathon judging criteria:
  - **Strategy Quality & Edge** — AI-enhanced algorithm engine, multi-strategy diversification, auto-exit triggers
  - **Risk Management** — on-chain guardrails, max drawdown limits, perp exposure caps, two-phase withdrawal
  - **Technical Implementation** — 23-instruction Anchor program, 102/107 devnet tests pass, 3-repo architecture
  - **Production Viability** — live on VPS (49.5h+ uptime), Docker healthchecks, CI/CD pipeline, Helius RPC
  - **Novelty & Innovation** — protocol-agnostic routing layer, keeper AI reasoning, DeFi yield scanner across all protocols

### Section 10: Links & Proof

- GitHub: `github.com/nanuqfi` (3 repos)
- Live App: `app.nanuqfi.com`
- Keeper API: `keeper.nanuqfi.com/v1/health`
- Devnet Program: `2QtJ5kmxLuW2jYCFpJMtzZ7PCnKdoMwkeueYoDUi5z5P`
- Key devnet transactions (Solscan links):
  - Deposit tx
  - Withdrawal tx
  - Rebalance tx: `27QZekLfghLpMnXw6AMMbBbiszY4dpy8quyKhQ7e5kymrRBhxYX8cwPDMeuM5oatrQRwS7UQFLKPMPkDoN4rbFaU`
  - Emergency halt/resume txs

---

## Interactive Elements

### Scroll Animations
- Intersection Observer via custom `useInView` hook
- Sections fade-up with staggered children (cards appear one by one)
- Animated counters tick up when section enters viewport
- CSS `scroll-behavior: smooth` for anchor links

### Live Data Widgets
- Reuse existing `useKeeperHealth`, `useKeeperDecisions`, `useMarketScan`, `useYieldEstimates` hooks from `use-keeper-api.ts`
- 30s poll interval (existing behavior)
- "Live" badge: green pulse dot + "Live" text
- Graceful fallback: show backtest data if keeper is unreachable

### Risk Level Toggle
- Two buttons: Moderate / Aggressive
- Fetches last decision for each from `/v1/decisions`
- Weight bars animate with CSS transitions (width change)
- Strategy cards show/hide based on risk level (aggressive includes funding capture)

### Backtest Chart
- Custom SVG line chart — no external charting library
- `<path>` elements for the two return lines
- `<circle>` hover targets with tooltip on mouseover
- Time period buttons filter the dataset (30d/60d/90d slice of the 90d data)
- Responsive: chart scales to container width

### Architecture Diagram
- SVG-based with CSS hover states
- Each node: hover highlights connected edges, shows tooltip with brief description
- Animated dashed-line flow on initial scroll-in

---

## Backtest Engine

### Location
`scripts/backtest.ts` in the nanuqfi-keeper repo

### Data Source
Drift Data API historical rates. Fetch daily snapshots:
- USDC lending rate (`/spotMarketRate?marketIndex=0`)
- SOL-PERP funding rate (`/fundingRate?marketIndex=0`)
- SOL borrow rate
- JitoSOL staking yield (from DeFi Llama or hardcoded historical)

Fallback: if historical API unavailable, use a curated dataset of known Drift rates from the past 90 days.

### Simulation Loop
```
for each day in [90 days ago ... today]:
  yieldData = fetchHistoricalRates(day)
  
  for each riskLevel in [moderate, aggressive]:
    proposal = algorithmEngine.proposeWeights(riskLevel, yieldData)
    dailyReturn = sum(weight * strategyReturn for each strategy)
    apply auto-exit triggers (same logic as live keeper)
    record: date, weights, return, drawdown
  
  track cumulative returns, max drawdown, sharpe ratio
```

### Output
`backtest-results.json` committed to nanuqfi-app repo at `src/data/backtest-results.json`:

```json
{
  "generatedAt": "2026-03-31T00:00:00Z",
  "period": { "start": "2025-12-31", "end": "2026-03-31", "days": 90 },
  "dataSource": "Drift Data API historical rates",
  "moderate": {
    "apy": 18.4,
    "maxDrawdown": 1.8,
    "sharpeRatio": 2.1,
    "totalReturn": 4.6,
    "winRate": 0.87,
    "dailyReturns": [
      { "date": "2025-12-31", "return": 0.05, "cumulative": 0.05, "drawdown": 0, "weights": { "drift-lending": 7800, "drift-jito-dn": 2200 } }
    ]
  },
  "aggressive": {
    "apy": 31.2,
    "maxDrawdown": 4.2,
    "sharpeRatio": 1.6,
    "totalReturn": 7.8,
    "winRate": 0.79,
    "dailyReturns": [...]
  },
  "disclaimer": "Simulated performance based on historical Drift protocol rates. Past performance is not indicative of future results. No slippage, gas costs, or position sizing modeled."
}
```

### Consumption
- Imported at build time in the pitch page: `import backtestData from '@/data/backtest-results.json'`
- No runtime dependency on the backtest script
- Can be regenerated anytime: `npx tsx scripts/backtest.ts`

---

## Visual Design

### Consistent with Existing App
- Dark theme: `slate-950` background
- Geist font family (sans + mono)
- Tailwind 4 utility classes
- Brand colors: sky-400 (primary), emerald-400 (positive/gains), red-400 (risk/loss), amber-400 (moderate), slate-400 (secondary text)

### Pitch-Specific Styling
- Full-width sections with generous vertical padding (`py-24` to `py-32`)
- Large typography for hero and key metrics (`text-5xl` to `text-7xl` for numbers)
- Subtle gradient dividers between sections (`from-transparent via-slate-800 to-transparent`)
- Cards with `border-slate-800` and subtle hover glow
- Pulse dot animation for "Live" badges: `animate-pulse` with custom green dot

### No New Dependencies
- CSS animations via Tailwind `animate-*` + custom keyframes in `globals.css`
- Intersection Observer via `useInView` hook (~15 lines)
- SVG chart hand-rolled (no D3, no Recharts, no Chart.js)
- All custom components per brand guidelines

---

## File Structure

```
nanuqfi-app/
  src/
    app/pitch/
      page.tsx              — main pitch page (section orchestrator)
    components/pitch/
      Hero.tsx              — hero section with animated counters
      Problem.tsx           — problem cards
      Solution.tsx          — solution cards
      Architecture.tsx      — interactive SVG flow diagram
      StrategyEngine.tsx    — risk toggle + live weight display
      BacktestResults.tsx   — chart + metrics from JSON data
      LiveProof.tsx         — keeper API live widgets
      DefiScanner.tsx       — market scan display (reuse from Activity)
      JudgingCriteria.tsx   — 5 criteria cards
      Links.tsx             — GitHub, app, keeper, Solscan links
    components/pitch/shared/
      AnimatedCounter.tsx   — number ticker animation
      useInView.tsx         — Intersection Observer hook
      SvgChart.tsx          — reusable SVG line chart
      FadeIn.tsx            — scroll-triggered fade wrapper
      PulseDot.tsx          — live indicator dot
    data/
      backtest-results.json — generated by keeper backtest script

nanuqfi-keeper/
  scripts/
    backtest.ts             — 90-day backtest using AlgorithmEngine
```

---

## Demo Video Plan

Silent screen recording (max 3 min), walking through the pitch page:

1. **0:00-0:10** — Open `app.nanuqfi.com/pitch`, hero loads with animated counters
2. **0:10-0:30** — Scroll through Problem → Solution sections
3. **0:30-0:50** — Architecture diagram, hover over nodes
4. **0:50-1:15** — Strategy Engine: toggle moderate ↔ aggressive, show weight changes
5. **1:15-1:50** — Backtest Results: hover chart, switch time periods, show metrics
6. **1:50-2:15** — Live Proof: show live keeper data updating, DeFi scanner results
7. **2:15-2:35** — Switch to `app.nanuqfi.com` — show real dashboard, connect wallet, vault detail
8. **2:35-2:50** — Show keeper API health endpoint in browser
9. **2:50-3:00** — Back to pitch page, show Judging Criteria + links

---

## Scope Boundaries

**In scope:**
- Pitch page with 10 sections
- Scroll animations + interactive elements
- Backtest script + JSON output
- Live keeper API integration (reuse existing hooks)
- Silent demo video recording

**Out of scope:**
- Mainnet deployment
- New keeper features
- New allocator instructions
- Mobile-responsive pitch page (desktop-first, judges use desktop)
- SEO/meta tags for pitch page (not indexed)

---

## Risk & Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| Drift historical data API unavailable | No backtest numbers | Curate dataset from known rates manually |
| Keeper goes down during judging | Live widgets show stale data | Fallback to backtest data + "last seen" timestamp |
| SVG chart complex to build | Time sink | Start with simple line chart, enhance if time permits |
| 7 days tight for all features | Incomplete submission | Priority order: backtest → core sections → interactivity → polish |

---

## Priority Order (if time constrained)

1. Backtest engine + JSON output (day 1)
2. Core pitch sections: Hero, Problem, Solution, Architecture, Backtest Results, Links (day 2-3)
3. Live data widgets + Strategy toggle (day 3-4)
4. Scroll animations + chart interactivity (day 4-5)
5. DeFi Scanner + Judging Criteria sections (day 5)
6. Polish + demo video recording (day 6)
7. Submit (day 7 — April 6)
