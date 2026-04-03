# NanuqFi Marketing Site — Design Spec

**Date:** 2026-04-03
**Status:** Approved
**Author:** RECTOR + CIPHER
**Repo:** `nanuqfi/nanuqfi-web` (new)

---

## Overview

A public-facing marketing/landing page for `nanuqfi.com` — the front door to the NanuqFi ecosystem. This is NOT the pitch page (that lives at `app.nanuqfi.com/pitch`). The marketing site is the 10-second hook: explain what NanuqFi is, show proof it works, funnel visitors to the app or pitch.

**Target audience:** Hackathon judges speed-scanning, DeFi users discovering NanuqFi, developers evaluating the protocol.

**Success criteria:** A visitor understands what NanuqFi does within 10 seconds and has a clear path to the app or pitch page.

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Repo | New repo `nanuqfi/nanuqfi-web` | Matches multi-repo pattern, own Docker/CI/CD, clean isolation |
| Framework | Next.js static export (`output: 'export'`) | Consistent stack, zero learning curve, Tailwind/Geist carry over |
| Content | Hybrid — hero + how it works + trust signals + footer | Enough to hook judges AND provide context, without duplicating pitch |
| Visual | Elevated marketing — dark, gradients, large type, breathing room | Same DNA as app but with landing page polish |
| Animation | Interactive canvas particles (constellation, mouse-reactive) | Eye-catching, ties to AI/tech brand, premium feel |
| Structure | Single-page scroll, 4 sections | Universal interaction, no missed content, fast to build |

---

## Domain Architecture

| Domain | Purpose | State |
|---|---|---|
| `nanuqfi.com` | Marketing site (this spec) | Currently wrong nginx default (shows Umami) |
| `app.nanuqfi.com` | Dashboard app (Next.js) | Live |
| `keeper.nanuqfi.com` | Keeper API | Live |

---

## Brand Alignment

Follows `nanuqfi-app/docs/brand-guidelines.md` with these marketing-specific adjustments:

- **Typography:** Geist Sans (display/body), Geist Mono (numbers/data). Larger scale than the app — hero at `text-7xl`.
- **Colors:** Same palette (slate-950 base, sky-500 primary, emerald/amber/red semantic). Enhanced with subtle gradients and glass-morphism effects.
- **Dark mode:** Default and only mode. No light mode toggle needed.
- **Motion:** More pronounced than app — particle canvas, scroll-triggered fade-ins, animated counters. Still deliberate, never bouncy.

---

## Page Structure

```
┌─────────────────────────────────────────────┐
│  HERO (100vh)                               │
│  Particle canvas background                 │
│  Eyebrow → Headline → Subline              │
│  Animated counters (3)                      │
│  Two CTAs                                   │
├─────────────────────────────────────────────┤
│  HOW IT WORKS                               │
│  3-step horizontal flow with connectors     │
├─────────────────────────────────────────────┤
│  TRUST SIGNALS                              │
│  6 metric cards (3x2 grid)                  │
│  Open source callout                        │
├─────────────────────────────────────────────┤
│  FOOTER                                     │
│  Links + credit                             │
└─────────────────────────────────────────────┘
```

---

## Section 1: Hero

**Layout:** Full viewport height (`100vh`), centered content over particle canvas.

### Background — Particle Canvas

Canvas-based particle field, constellation style:
- Dots: `sky-500` at ~0.3 opacity, small (2-3px radius)
- Connection lines: `slate-600`, drawn between dots within proximity threshold (~150px)
- Drift: slow ambient movement, subtle randomness
- Mouse interaction: particles gently attract/repel from cursor position
- Overlay: radial gradient from center (dark transparent → `slate-950` at edges) to keep focus on text
- Performance: `requestAnimationFrame` loop, ~80-120 particles, no performance concern on modern hardware

### Content (centered, `max-w-4xl`)

1. **Eyebrow:** `AI-Powered DeFi` — `text-sm`, `tracking-widest`, `uppercase`, `sky-400`
2. **Headline:** `Yield, Routed.` — `text-7xl` (mobile: `text-5xl`), `font-bold`, white
3. **Subline:** `Deposit USDC. Pick your risk. Let the AI route to the best yield across DeFi.` — `text-xl`, `slate-400`, `max-w-2xl`
4. **Animated counters** (3 items, horizontal on desktop, stacked on mobile):
   - `16.1% APY` — label: "Moderate Strategy"
   - `19.4% APY` — label: "Aggressive Strategy"
   - `50+` — label: "Protocols Scanned"
   - Style: value in `text-3xl`, `font-mono`, white; label in `text-sm`, `slate-400`
5. **CTAs** (side by side):
   - Primary: `Launch App →` — `bg-sky-500 hover:bg-sky-400 text-white rounded-lg px-6 py-3` → `app.nanuqfi.com`
   - Secondary: `View Pitch →` — `border border-slate-600 hover:border-sky-500 text-slate-300 rounded-lg px-6 py-3` → `app.nanuqfi.com/pitch`

### Animation

Content fades in on load with staggered delays:
- Eyebrow → Headline → Subline → Counters → CTAs
- 100ms stagger between each group
- `opacity 0→1`, `translateY 20px→0`, `duration 600ms`, `ease-out`

---

## Section 2: How It Works

**Layout:** `py-24`, `max-w-5xl`, centered. Top border: `border-t border-slate-800/50`.

### Header

- Title: `How It Works` — `text-4xl`, `font-bold`, white, centered
- Subtitle: `Three steps. Fully on-chain. No trust required.` — `text-lg`, `slate-400`, centered

### 3-Step Flow

Desktop: 3 columns. Mobile: stacked vertical.

| Step | Icon (Lucide) | Title | Description |
|---|---|---|---|
| 1 | `Wallet` | Deposit USDC | Choose a risk vault — conservative, moderate, or aggressive. Your capital stays in the on-chain allocator program. |
| 2 | `Cpu` | AI Routes Capital | The keeper bot scans 50+ protocols, the algorithm engine picks optimal allocations, on-chain guardrails enforce limits. |
| 3 | `TrendingUp` | Earn Yield | Capital flows to the best risk-adjusted yield. Auto-exit triggers protect against drawdowns. Withdraw anytime. |

### Visual Connector

Dashed horizontal line between steps with animated gradient pulse (`sky-500` → transparent, left to right). On mobile: vertical dashed line.

### Card Style

No visible card borders. Each step:
- Icon: 48px, `sky-500`
- Title: `text-lg`, `font-semibold`, white
- Description: `text-sm`, `slate-400`, `max-w-xs`

### Animation

Each step fades up on scroll intersection (`IntersectionObserver`), staggered 150ms.

---

## Section 3: Trust Signals

**Layout:** `py-24`, `max-w-5xl`, centered. Background: subtle gradient shift `slate-950` → `slate-900/50`.

### Header

- Title: `Built to Be Audited` — `text-4xl`, `font-bold`, white, centered
- Subtitle: `Every line of code, every decision, every guardrail — open and verifiable.` — `text-lg`, `slate-400`, centered

### Metrics Grid

3x2 on desktop, 2x3 on tablet, 1-col on mobile.

| Value | Label |
|---|---|
| `23` | On-chain Instructions |
| `102/107` | Devnet Tests Passing |
| `50+` | Protocols Scanned |
| `4` | Yield Strategies |
| `445+` | Keeper Cycles, 0 Failures |
| `3` | Open Source Repos |

### Card Style

Glass morphism:
- `bg-slate-800/30`
- `border border-slate-700/50`
- `rounded-xl`
- `backdrop-blur-sm`
- `p-6`

Value: `text-4xl`, `font-mono`, `font-bold`, white
Label: `text-sm`, `slate-400`

Values animate (count up from 0) on scroll intersection.

### Open Source Callout

Below grid, centered:
- GitHub icon (Lucide) + `Fully open source` — `text-sm`, `slate-500`
- Links to `github.com/nanuqfi`

---

## Section 4: Footer

**Layout:** `py-16`, `max-w-5xl`, centered. `border-t border-slate-800`.

### Row 1 — Links (centered, `gap-8`)

| Label | URL |
|---|---|
| App | `app.nanuqfi.com` |
| Pitch | `app.nanuqfi.com/pitch` |
| GitHub | `github.com/nanuqfi` |
| Keeper API | `keeper.nanuqfi.com` |

Style: `text-sm`, `slate-400`, `hover:text-sky-400`, `transition-colors`.

### Row 2 — Credit (`mt-6`, centered)

`NanuqFi — Yield, Routed.` — `text-xs`, `slate-600`

---

## Technical Details

### Stack

- **Framework:** Next.js 15 (App Router) with `output: 'export'` in `next.config.ts`
- **Styling:** Tailwind CSS 4
- **Font:** Geist Sans + Geist Mono (loaded via `next/font`)
- **Icons:** Lucide React
- **Canvas:** vanilla `<canvas>` with `requestAnimationFrame`, no library
- **Animations:** CSS transitions + `IntersectionObserver` for scroll triggers

### Project Structure

```
nanuqfi-web/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout (fonts, metadata, dark bg)
│   │   └── page.tsx            # Single page composing all sections
│   └── components/
│       ├── hero.tsx            # Hero section
│       ├── particle-canvas.tsx # Canvas particle system
│       ├── how-it-works.tsx    # 3-step flow
│       ├── trust-signals.tsx   # Metrics grid
│       ├── footer.tsx          # Footer
│       ├── animated-counter.tsx # Count-up animation
│       └── fade-in.tsx         # Scroll-triggered fade-in wrapper
├── public/
│   └── favicon.ico
├── tailwind.config.ts
├── next.config.ts              # output: 'export'
├── package.json
├── tsconfig.json
├── Dockerfile
├── .github/
│   └── workflows/
│       └── deploy.yml          # Build → GHCR → VPS auto-deploy
├── CLAUDE.md
└── README.md
```

### Deployment

- **Docker:** Multi-stage build — Node for `next build`, nginx for serving static output (`out/` directory)
- **CI/CD:** GitHub Actions → build Docker image → push to GHCR → SSH deploy to VPS
- **VPS:** nginx config updated to serve `nanuqfi-web` container on `nanuqfi.com` instead of Umami
- **Cloudflare:** DNS already points `nanuqfi.com` to VPS, proxied

### SEO / Meta

- `<title>`: `NanuqFi — Yield, Routed.`
- `<meta description>`: `AI-powered yield routing for DeFi. Deposit USDC, pick your risk, earn optimized yield across 50+ protocols.`
- Open Graph image: static OG image (`1200x630`) — slate-950 background, "NanuqFi" in Geist Sans bold, "Yield, Routed." subtitle, sky-500 accent line. Generated as a static PNG in `public/og.png` (hand-coded or generated during build, not a runtime API).
- `robots.txt`: allow all
- `sitemap.xml`: single URL

### Performance Targets

- Lighthouse: 95+ across all categories
- First Contentful Paint: <1s
- Total page weight: <500KB (static export + canvas JS)
- Zero external API calls on load (all data is hardcoded)

---

## What This Is NOT

- Not the pitch page (that's `app.nanuqfi.com/pitch` — deep technical walkthrough)
- Not the app dashboard (that's `app.nanuqfi.com` — wallet connect, vault management)
- Not a docs site (no documentation, no API reference)
- No wallet connection, no transactions, no on-chain interaction

---

## Content Source of Truth

All numbers on the marketing site are hardcoded (not fetched):
- APY figures from `nanuqfi-app/src/data/backtest-results.json`
- Metric counts from current project state (23 instructions, 102/107 tests, etc.)
- These are updated manually when the protocol evolves
