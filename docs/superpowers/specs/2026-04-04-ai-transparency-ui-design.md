# AI Transparency UI — Design Spec

**Date:** 2026-04-04
**Status:** Approved
**Repos:** `nanuqfi/nanuqfi-keeper` + `nanuqfi/nanuqfi-app`

---

## Overview

Make the AI keeper's reasoning visible across the entire NanuqFi UI. Users and judges should see WHY the keeper allocated the way it did — per-strategy confidence scores, risk flags, and reasoning text — on the pitch page, vault detail page, and activity page.

**Principle:** "Transparency as UX" — every allocation, every decision, every AI judgment is visible.

---

## Keeper API Changes (nanuqfi-keeper)

### AI History Persistence

Store AI insights to disk so they survive keeper restarts:

- **File:** `/data/ai-history.json` (Docker volume mount)
- **Format:** JSON array of `AIInsight` objects (with timestamps)
- **Max entries:** 500 (rotate oldest when exceeded)
- **Write:** Append after each successful AI cycle
- **Read:** Load into memory on keeper boot

### New Endpoint

**GET /v1/ai/history?limit=20**

Returns an array of historical AI insights, newest first:

```json
[
  {
    "strategies": { "drift-lending": 0.82, "drift-basis": 0.5, ... },
    "riskElevated": false,
    "reasoning": "...",
    "timestamp": 1775294989282
  },
  ...
]
```

Query params:
- `limit` — max entries to return (default 20, max 100)

### Existing Endpoints (no changes needed)

- `GET /v1/ai` — current insight (already implemented)
- `GET /v1/decisions` — already includes `aiInsight` per decision

### Docker Volume

Update `docker-compose.yml` to mount a persistent volume:

```yaml
volumes:
  - nanuqfi-keeper-data:/data

volumes:
  nanuqfi-keeper-data:
```

---

## App UI Changes (nanuqfi-app)

### New Hook

**useAIInsight()** — polls `/v1/ai` every 30s via the existing `useKeeperData` generic hook.

```typescript
function useAIInsight(): {
  data: { available: boolean; insight: AIInsight | null } | null
  loading: boolean
  isStale: boolean
}
```

### New Component: ConfidenceBar

Reusable component for displaying per-strategy AI confidence:

```typescript
interface ConfidenceBarProps {
  strategy: string       // display name
  value: number          // 0.0 - 1.0
}
```

- Horizontal bar, `h-2`, `rounded-full`
- Color thresholds:
  - `> 0.7` → `bg-emerald-500` (confident)
  - `0.4 - 0.7` → `bg-amber-500` (uncertain)
  - `< 0.4` → `bg-red-500` (low confidence)
- Value label: `font-mono text-xs` right-aligned
- Strategy name: `text-sm text-slate-400` left-aligned
- Background track: `bg-slate-800`

### New Component: AIInsightCard

Glass card displaying the full AI assessment:

- **Header:** "AI Assessment" with status dot (green = available, gray = unavailable)
- **Confidence bars:** One per strategy in the current insight
- **Risk flag:** "Risk Elevated" badge (red) or "Normal Conditions" (green/muted)
- **Reasoning:** Collapsible text block, `text-sm text-slate-400`, max 3 lines with expand
- **Timestamp:** "Updated X minutes ago" in `text-xs text-slate-500`
- **Fallback:** "AI assessment unavailable" message when insight is null

Card style: Same glass morphism as trust signals — `bg-slate-800/30`, `border border-slate-700/50`, `rounded-xl`, `backdrop-blur-sm`.

---

## Placement

### 1. Pitch Page — Live Tab (`src/components/pitch/LiveProof.tsx`)

Add "AI Assessment" card as a new section after the existing "Keeper Status" card:

```
[Keeper Status]  [Live Yields]
[AI Assessment — full width]
[Last Decision]  [Yield Scanner]
```

Uses `useAIInsight()` hook. Shows all 4 strategies with confidence bars, risk flag, and reasoning.

### 2. Vault Detail Page (`src/app/(app)/vaults/[riskLevel]/page.tsx`)

Add "AI Strategy Assessment" section after "Allocation Breakdown" and before "Guardrails":

```
[Stats Row]
[Your Position]  [Manage Position]
[Allocation Breakdown]
[AI Strategy Assessment]    ← NEW
[Guardrails]
[Last Keeper Decision]
[Recent History]
```

Filter confidence bars to only strategies active in this vault's allocation. Uses same `useAIInsight()` hook.

Also enhance "Last Keeper Decision" card: if `aiInvolved` is true, show a `Bot` icon badge in sky-400 instead of the current hardcoded badge.

### 3. Activity Page (`src/app/(app)/activity/page.tsx`)

Enhance each decision row: if `aiInvolved` is true and `aiReasoning` exists, add an expandable section below the decision summary:

- Collapsed: show "AI" badge + one-line reasoning preview (truncated)
- Expanded: full reasoning text + confidence scores if available

No new API calls needed — `aiReasoning` is already in the decision data from `/v1/vaults/{level}/decisions`.

---

## Data Flow

```
Keeper AI Cycle (every 2hr)
  → Validate & cache AIInsight in memory
  → Append to /data/ai-history.json (persist)
  → Available via GET /v1/ai (current) and GET /v1/ai/history (past)
  → Attached to each KeeperDecision (in /v1/decisions)

App (every 30s poll)
  → useAIInsight() fetches /v1/ai
  → AIInsightCard renders on pitch, vault detail, activity
  → useKeeperDecisions() already has aiInsight/aiReasoning per decision
```

---

## Files to Create/Modify

### nanuqfi-keeper

| File | Change |
|---|---|
| `src/keeper.ts` | Add AI history array, persist to disk, load on boot |
| `src/health/api.ts` | Add `/v1/ai/history` route |
| `docker-compose.yml` (VPS) | Add volume mount for `/data` |

### nanuqfi-app

| File | Change |
|---|---|
| `src/hooks/use-keeper-api.ts` | Add `useAIInsight()` hook |
| `src/components/confidence-bar.tsx` | New — reusable confidence bar |
| `src/components/ai-insight-card.tsx` | New — glass card with bars + reasoning |
| `src/components/pitch/LiveProof.tsx` | Add AIInsightCard section |
| `src/app/(app)/vaults/[riskLevel]/page.tsx` | Add AI assessment section, fix aiInvolved badge |
| `src/app/(app)/activity/page.tsx` | Add expandable AI reasoning per decision |

---

## Testing

### Keeper
- AI history persists to file and loads on boot
- `/v1/ai/history` returns correct limit and ordering
- History caps at 500 entries

### App
- `useAIInsight()` returns data when available, null when not
- ConfidenceBar renders correct color for each threshold
- AIInsightCard renders with real data and fallback state
- All 3 pages render AI sections without errors
