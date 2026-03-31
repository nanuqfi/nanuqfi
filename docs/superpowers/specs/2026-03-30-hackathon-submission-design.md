# NanuqFi Hackathon Submission — Design Spec (v2)

**Hackathon:** Ranger Build-A-Bear (Main Track + Drift Side Track)
**Deadline:** April 6, 2026 23:59 UTC (7 days)
**Submission URL:** `https://app.nanuqfi.com/pitch`

---

## Overview

Interactive web pitch deck at `/pitch` in the nanuqfi-app repo. Single scrollable page that serves as the complete hackathon submission — strategy thesis, architecture, backtest results, live proof, and demo links. Judges get one URL that tells the entire story.

**Positioning:** Devnet-validated, mainnet-ready. Program deployed, keeper operational, architecture proven at devnet scale. Mainnet deployment pending security review — we ship when it's right, not when it's fast.

---

## Submission Checklist (Hackathon Requirements)

| Requirement | How We Address It |
|---|---|
| Demo Video (3 min) | Silent screen recording with text captions at key moments |
| Strategy Documentation | The pitch page itself — thesis, risk management, architecture, backtest |
| Code Repository | GitHub org `nanuqfi/` — add @jakeyvee as collaborator (all 3 repos) |
| On-chain Verification | Devnet Solscan links (deposit/withdraw/rebalance/halt/resume txs) |
| Backtested Results | 90-day backtest using AlgorithmEngine against Drift historical rates |
| Min 10% APY | Backtest output determines actual APY (not pre-committed) |
| USDC only | Yes — all vaults are USDC denominated |

---

## Page Structure (7 Sections)

Route: `/pitch` in nanuqfi-app (Next.js App Router)
Layout: `src/app/pitch/layout.tsx` — minimal (no nav, full-width, no SolanaProvider)
Page: `src/app/pitch/page.tsx`

### Section 1: Hero

- Headline: "Yield, Routed."
- Subline: "AI-powered USDC yield routing across Drift Protocol strategies. Transparent allocations, real-time guardrails, autonomous rebalancing."
- Animated counters: backtest APY (moderate + aggressive), protocols scanned, keeper cycles completed
- Subtle gradient background, full viewport height
- Small "Built by" line at bottom linking to GitHub profile

### Section 2: How It Works (Architecture + Value Prop)

Replaces separate Problem/Solution sections. The architecture diagram IS the solution — show, don't tell.

- One-liner above diagram: "One vault. AI-optimized. Fully transparent."
- Static SVG flow diagram:
  - User deposits USDC → Allocator Program (on-chain guardrails) → Keeper (AI + Algorithm Engine) → Drift strategies (Lending, Basis, Funding, JitoSOL DN)
- Brief labels on each node explaining what it does
- Below diagram: "NanuqFi vs Status Quo" comparison — 3-4 bullet points:
  - vs Manual DeFi: "No spreadsheets, no 3am rebalances"
  - vs Yearn/Kamino: "Protocol-agnostic routing, not locked to one protocol"
  - vs Existing Drift Vaults: "AI-enhanced with auto-exit triggers, not static allocations"
  - vs Centralized Yield: "On-chain program enforces guardrails — trust the code, not the operator"

### Section 3: Strategy Engine (Interactive)

- **Risk level toggle**: Moderate / Aggressive buttons
- Switches displayed allocation breakdown (real data from last keeper decision via `/v1/decisions`)
- Weight bars animate between the two risk profiles with CSS transitions
- Shows which strategies are included/excluded per risk level
- Auto-exit trigger cards below the weights:
  - "Basis trade: auto-exit if spread < 4bps for 4h"
  - "Insurance: auto-exit if drawdown > 30%"
  - "Funding: auto-exit if PnL < -2% (moderate) / -5% (aggressive)"
  - "JitoSOL DN: auto-exit if borrow rate > staking yield"
- **Risk Management callout**: max drawdown limits (5% moderate, 10% aggressive), perp exposure caps (60%), two-phase withdrawal with redemption period

### Section 4: Backtest Results (Interactive)

- **Key metrics row**: APY, Max Drawdown, Sharpe Ratio, Sortino Ratio — animated counters
- **Benchmark line**: USDC lending baseline APY shown alongside to prove alpha
- **Performance chart**: SVG line chart showing cumulative returns over 90 days
  - Three lines: moderate (sky-400), aggressive (amber-400), USDC lending baseline (slate-500 dashed)
  - Chart colors chosen for colorblind accessibility (sky + amber, not sky + emerald)
  - MVP: static paths, no hover. Enhanced: hover tooltip with date + return + drawdown
- **Comprehensive disclaimer** (expandable):
  - "Simulated performance based on historical Drift protocol rates"
  - "Daily granularity — sub-daily auto-exit trigger timing not modeled"
  - "No slippage, gas/priority fees, or position entry/exit delay"
  - "Infinite market depth assumed — no liquidity constraints"
  - "No funding rate impact from own position size"
  - "Past performance is not indicative of future results"

### Section 5: Live Proof + DeFi Scanner

Merged section — all live data in one place with tabs or side-by-side layout.

- **Keeper Status** card: uptime, cycles completed, 0 failures (from `/v1/health`) — PulseDot "Live" badge
- **Current Yields** card: lending rate, funding rate, borrow rate, jito yield (from `/v1/yields`)
- **Last Decision** card: risk level, weights, timestamp, "AI Assisted" badge (from `/v1/decisions`)
- **DeFi Scanner** card: top 5 yield opportunities (from `/v1/market-scan`), Drift rank vs market
- Poll interval: 60s (not 30s — pitch page is read-only, no need for aggressive polling)
- **Fallback**: if keeper API unreachable, show baked-in `fallback-keeper-data.json` with "Last updated: [timestamp]" instead of empty cards or warning banners. Never show loading spinners during judging.

### Section 6: Why NanuqFi (Compact Grid)

Replaces verbose "Judging Criteria Alignment" cards. Compact 2-row metric grid:

| Metric | Value |
|---|---|
| On-chain instructions | 23 |
| Devnet tests passing | 102/107 (95%) |
| Keeper uptime | 49.5h+, 0 crashes |
| Strategies | 4 active + protocol-agnostic interface |
| Yield sources scanned | 50+ protocols (DeFi Llama) |
| Repos | 3 (core SDK, keeper, frontend) |

Below grid: "Devnet-validated, mainnet-ready. Full deposit → rebalance → withdraw cycle verified on live infrastructure."

**Capacity note**: Brief mention of Drift USDC lending market depth and expected vault capacity range.

### Section 7: Links, Proof & Built By

- **Devnet Transactions** (Solscan links):
  - Deposit tx (from Phase F testing)
  - Withdrawal tx (from Phase F testing)
  - Rebalance tx: `27QZekLfghLpMnXw6AMMbBbiszY4dpy8quyKhQ7e5kymrRBhxYX8cwPDMeuM5oatrQRwS7UQFLKPMPkDoN4rbFaU`
  - Emergency halt tx: `2Xc5qAzYcEJRFq7jMeK4Gm8yKvXDxTpewZZs2y6JMM4v7hwuApXdXByKY9NhAzGJEqb5Sza41428o7zNxFJdhDhf`
- **Live Links**:
  - GitHub: `github.com/nanuqfi` (3 repos)
  - Live App: `app.nanuqfi.com`
  - Keeper API: `keeper.nanuqfi.com/v1/health`
  - Devnet Program: `2QtJ5kmxLuW2jYCFpJMtzZ7PCnKdoMwkeueYoDUi5z5P`
- **Built By** card: Name, GitHub profile link, brief background. "Solo builder. Mainnet deployment pending security review."
- **What's Next**: 2-3 bullet roadmap (mainnet launch, additional protocols Mango/Marginfi/Kamino, security audit)

---

## Interactive Elements

### Scroll Animations
- Intersection Observer via custom `useInView` hook (`hooks/use-in-view.ts`)
- Sections fade-up with staggered children (cards appear one by one)
- Animated counters tick up when section enters viewport (use `tabular-nums` to prevent layout shift)
- CSS `scroll-behavior: smooth` for anchor links

### Live Data Widgets
- Reuse existing `useKeeperHealth`, `useKeeperDecisions`, `useMarketScan`, `useYieldEstimates` hooks
- 60s poll interval (relaxed from 30s — pitch page is read-only)
- "Live" badge: green PulseDot + "Live" text
- **Baked fallback**: import `fallback-keeper-data.json` — used when both `data === null && error !== null`. Show "Last updated: [timestamp]" instead of stale warning. Never empty cards.

### Risk Level Toggle
- Two buttons: Moderate / Aggressive
- Fetches last decision for each from `/v1/decisions`
- Weight bars animate with CSS transitions (width change)
- Strategy cards show/hide based on risk level (aggressive includes funding capture)

### Backtest Chart
- Custom SVG line chart — no external charting library
- Three `<path>` elements: moderate line, aggressive line, baseline dashed line
- Chart colors: sky-400 (moderate), amber-400 (aggressive), slate-500 dashed (baseline)
- MVP: static paths with axis labels, responsive to container width
- Enhanced (day 5 stretch): `<circle>` hover targets with tooltip on mouseover
- No time period buttons — show full 90d dataset

### Architecture Diagram
- Static SVG with labeled nodes and directional arrows
- No hover interactivity (cut — high effort, low impact for judges)
- Animated dashed-line flow on scroll-in (CSS `stroke-dashoffset` animation)

---

## Backtest Engine

### Location
`scripts/backtest.ts` in the nanuqfi-keeper repo

### Data Source
Drift Data API historical rates. Fetch daily snapshots:
- USDC lending rate (`/spotMarketRate?marketIndex=0`)
- SOL-PERP funding rate (`/fundingRate?marketIndex=0`)
- SOL borrow rate
- JitoSOL staking yield (DeFi Llama `/pools` filtered by Jito, with exact endpoint documented)

Fallback: if historical API unavailable, use a curated dataset of known Drift rates with source citations for each data point.

### Simulation Loop
```
for each day in [90 days ago ... today]:
  yieldData = fetchHistoricalRates(day)

  for each riskLevel in [moderate, aggressive]:
    proposal = algorithmEngine.proposeWeights(riskLevel, yieldData)
    dailyReturn = sum(weight * strategyReturn for each strategy)
    apply auto-exit triggers (same logic as live keeper)
    record: date, weights, return, drawdown

  // Baseline comparison
  baselineReturn = yieldData.usdcLendingRate / 365

  track cumulative returns, max drawdown, sharpe ratio, sortino ratio
```

### Output
`backtest-results.json` committed to nanuqfi-app repo at `src/data/backtest-results.json`.

Numbers are NOT pre-committed — the backtest runs and outputs whatever the data produces. The spec is agnostic to the actual APY.

```json
{
  "generatedAt": "ISO timestamp",
  "period": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "days": 90 },
  "dataSource": "Drift Data API historical rates",
  "baseline": {
    "strategy": "USDC lending only",
    "apy": null,
    "totalReturn": null,
    "dailyReturns": []
  },
  "moderate": {
    "apy": null,
    "maxDrawdown": null,
    "sharpeRatio": null,
    "sortinoRatio": null,
    "totalReturn": null,
    "winRate": null,
    "alphaOverBaseline": null,
    "dailyReturns": [
      { "date": "YYYY-MM-DD", "return": 0, "cumulative": 0, "drawdown": 0, "weights": {} }
    ]
  },
  "aggressive": {
    "apy": null,
    "maxDrawdown": null,
    "sharpeRatio": null,
    "sortinoRatio": null,
    "totalReturn": null,
    "winRate": null,
    "alphaOverBaseline": null,
    "dailyReturns": []
  },
  "disclaimer": "Simulated performance based on historical Drift protocol rates. Daily granularity — sub-daily auto-exit trigger timing not modeled. No slippage, gas/priority fees, position entry/exit delay, or liquidity constraints. Infinite market depth assumed. Past performance is not indicative of future results."
}
```

### Consumption
- Imported at build time: `import backtestData from '@/data/backtest-results.json'`
- No runtime dependency on the backtest script
- Regenerate anytime: `cd ~/local-dev/nanuqfi-keeper && npx tsx scripts/backtest.ts`
- Output path configurable: defaults to `../nanuqfi-app/src/data/backtest-results.json`

---

## Visual Design

### Consistent with Existing App
- Dark theme: `slate-950` background
- Geist font family (sans + mono)
- Tailwind 4 utility classes
- Brand colors: sky-400 (primary), amber-400 (moderate/secondary chart line), red-400 (risk/loss), slate-400 (secondary text)

### Pitch-Specific Styling
- Full-width sections with generous vertical padding (`py-24` to `py-32`)
- Large typography for hero and key metrics (`text-5xl` to `text-7xl` for numbers, `font-mono tabular-nums`)
- Subtle gradient dividers between sections (`from-transparent via-slate-800 to-transparent`)
- Cards with `border-slate-800` and subtle hover glow
- PulseDot: CSS `animate-pulse` on a green dot for "Live" badges

### No New Dependencies
- CSS animations via Tailwind `animate-*` + custom keyframes in `globals.css`
- Intersection Observer via `use-in-view.ts` hook (~15 lines)
- SVG chart hand-rolled
- All custom components per brand guidelines

---

## File Structure

```
nanuqfi-app/
  src/
    app/pitch/
      layout.tsx              — minimal layout (no nav, full-width)
      page.tsx                — section orchestrator
    components/pitch/
      Hero.tsx                — hero with animated counters + "built by"
      Architecture.tsx        — static SVG diagram + value prop + vs status quo
      StrategyEngine.tsx      — risk toggle + weight bars + auto-exit cards
      BacktestResults.tsx     — SVG chart + metrics + disclaimer
      LiveProof.tsx           — keeper API widgets + DeFi scanner (merged)
      WhyNanuqfi.tsx          — compact metric grid
      LinksAndProof.tsx       — Solscan links, live links, built by, roadmap
      AnimatedCounter.tsx     — number ticker animation
      FadeIn.tsx              — scroll-triggered fade wrapper
      PulseDot.tsx            — live indicator dot
      SvgLineChart.tsx        — reusable SVG line chart (3 lines)
    hooks/
      use-in-view.ts          — Intersection Observer hook
    data/
      backtest-results.json   — generated by keeper backtest script
      fallback-keeper-data.json — baked-in last-known-good keeper data

nanuqfi-keeper/
  scripts/
    backtest.ts               — 90-day backtest using AlgorithmEngine
```

Total: 11 component files + 1 hook + 1 layout + 1 page + 2 data files = **16 new files**

---

## Demo Video Plan

Silent screen recording with **text captions** at key moments (max 3 min):

1. **0:00-0:10** — Open `/pitch`, hero loads with animated counters. Caption: "NanuqFi — AI-Powered Yield Routing"
2. **0:10-0:30** — Scroll to Architecture. Caption: "Protocol-agnostic design — one vault, multiple strategies"
3. **0:30-1:00** — Strategy Engine: toggle moderate ↔ aggressive. Caption: "Interactive risk profiles with auto-exit triggers"
4. **1:00-1:40** — Backtest Results: show chart + metrics. Caption: "90-day backtest against historical Drift rates"
5. **1:40-2:10** — Live Proof: show keeper data updating, scanner. Caption: "Live keeper running on VPS — real-time data"
6. **2:10-2:35** — Switch to `app.nanuqfi.com` — dashboard, vault detail, show wallet connected
7. **2:35-2:50** — Show keeper API health in browser tab
8. **2:50-3:00** — Back to pitch, show Links section. Caption: "Devnet-validated. Mainnet-ready."

---

## Scope Boundaries

**In scope:**
- Pitch page with 7 sections
- Scroll animations + interactive risk toggle
- Backtest script + JSON output with baseline comparison
- Live keeper API integration (reuse existing hooks + baked fallback)
- Fallback keeper data for offline resilience
- Silent demo video with text captions
- Add @jakeyvee as collaborator on all 3 repos

**Out of scope:**
- Mainnet deployment
- New keeper features or allocator instructions
- Mobile-responsive pitch page (desktop-first)
- SEO/meta tags
- Chart hover tooltips (stretch goal for day 5)
- Time period filter buttons on chart

---

## Risk & Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| Drift historical data API unavailable | No backtest numbers | Curate dataset from known rates with source citations |
| Keeper goes down during judging | Live widgets show stale data | Baked fallback JSON with "Last updated" timestamp — never empty |
| SVG chart complex to build | Time sink | MVP first (static paths), enhance only if day 4 complete |
| Backtest APY below 10% threshold | Disqualification | Run backtest early (day 1); if below threshold, investigate data/engine |
| 7 days tight | Incomplete submission | Strict priority order below; cut interactivity before content |
| Judges don't scroll to bottom | Miss key content | Front-load: hero counters sell APY immediately, architecture shows the system |

---

## Priority Order (7-Day Schedule)

1. **Day 1**: Backtest engine + generate JSON. Pitch layout + Hero section.
2. **Day 2**: Architecture (static SVG + vs status quo), StrategyEngine (risk toggle + weight bars)
3. **Day 3**: BacktestResults (MVP chart — 3 static paths + metrics row), LinksAndProof section
4. **Day 4**: LiveProof (compose existing hooks + PulseDot + fallback data), WhyNanuqfi grid
5. **Day 5**: Scroll animations (FadeIn + AnimatedCounter), chart hover tooltips if time permits. Add @jakeyvee.
6. **Day 6**: End-to-end test on fresh browser. Record demo video with captions. Test with keeper offline.
7. **Day 7 (April 6)**: Buffer. Fix issues from day 6 testing. Submit before 23:59 UTC.

**What gets cut if behind schedule (in order):**
1. Chart hover tooltips (defer)
2. Animated stroke-dashoffset on architecture diagram (static is fine)
3. Scroll fade-in animations (content matters more than motion)
4. DeFi scanner in LiveProof (keep just keeper status + yields + last decision)
