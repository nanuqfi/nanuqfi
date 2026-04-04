# AI Transparency UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI keeper's reasoning visible across all NanuqFi pages — confidence bars, risk flags, and reasoning text on the pitch page, vault detail page, and activity page.

**Architecture:** Keeper persists AI insight history to disk, exposes via `/v1/ai/history` endpoint. App polls `/v1/ai` via new hook, renders reusable ConfidenceBar and AIInsightCard components across 3 pages.

**Tech Stack:** TypeScript, Node.js (keeper), Next.js 16 / React 19 / Tailwind 4 (app)

**Spec:** `docs/superpowers/specs/2026-04-04-ai-transparency-ui-design.md`

---

## File Structure

### nanuqfi-keeper
```
src/
├── keeper.ts                    # MODIFY — persist AI history to disk, load on boot
└── health/
    └── api.ts                   # MODIFY — add /v1/ai/history route
```

### nanuqfi-app
```
src/
├── hooks/
│   └── use-keeper-api.ts        # MODIFY — add useAIInsight() hook + AIInsightData type
├── components/
│   ├── confidence-bar.tsx       # CREATE — reusable confidence bar
│   ├── ai-insight-card.tsx      # CREATE — glass card with bars + reasoning
│   ├── index.ts                 # MODIFY — export new components
│   └── pitch/
│       └── LiveProof.tsx        # MODIFY — add AI Assessment card
├── app/(app)/
│   ├── vaults/[riskLevel]/
│   │   └── page.tsx             # MODIFY — add AI assessment section
│   └── activity/
│       └── page.tsx             # MODIFY — add expandable AI reasoning
```

---

### Task 1: Keeper — AI History Persistence

**Files:**
- Modify: `~/local-dev/nanuqfi-keeper/src/keeper.ts`

- [ ] **Step 1: Add fs imports and history constants at top of keeper.ts**

Add after existing imports:

```typescript
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const AI_HISTORY_PATH = process.env.AI_HISTORY_PATH ?? '/data/ai-history.json'
const AI_HISTORY_MAX = 500
```

- [ ] **Step 2: Add history array and persistence methods to Keeper class**

Add these private fields alongside existing ones:

```typescript
  private aiHistory: AIInsight[] = []
```

Add these private methods to the class:

```typescript
  private loadAIHistory(): void {
    try {
      const raw = readFileSync(AI_HISTORY_PATH, 'utf-8')
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        this.aiHistory = parsed.slice(-AI_HISTORY_MAX)
      }
    } catch {
      this.aiHistory = []
    }
  }

  private saveAIHistory(): void {
    try {
      mkdirSync('/data', { recursive: true })
      writeFileSync(AI_HISTORY_PATH, JSON.stringify(this.aiHistory))
    } catch (err) {
      console.error('[AI] Failed to persist history:', err instanceof Error ? err.message : err)
    }
  }
```

- [ ] **Step 3: Load history on boot**

In the `boot()` method, add at the start:

```typescript
    this.loadAIHistory()
```

- [ ] **Step 4: Persist after each successful AI cycle**

In `runAICycle()`, after `this.cachedInsight = { ...result.insight, timestamp: Date.now() }`, add:

```typescript
        this.aiHistory.push(this.cachedInsight)
        if (this.aiHistory.length > AI_HISTORY_MAX) {
          this.aiHistory = this.aiHistory.slice(-AI_HISTORY_MAX)
        }
        this.saveAIHistory()
```

- [ ] **Step 5: Add public accessor**

```typescript
  getAIHistory(limit = 20): AIInsight[] {
    return this.aiHistory.slice(-limit).reverse()
  }
```

- [ ] **Step 6: Run tests**

```bash
cd ~/local-dev/nanuqfi-keeper && pnpm test
```

Expected: ALL PASS (existing tests unaffected — file ops don't run in test because boot() is not called).

- [ ] **Step 7: Commit**

```bash
git add src/keeper.ts
git commit -m "feat: persist AI insight history to disk, load on boot"
```

---

### Task 2: Keeper — /v1/ai/history Endpoint

**Files:**
- Modify: `~/local-dev/nanuqfi-keeper/src/health/api.ts`
- Modify: `~/local-dev/nanuqfi-keeper/src/main.ts`

- [ ] **Step 1: Add getAIHistory to KeeperDataSource interface**

In `src/health/api.ts`, add to the `KeeperDataSource` interface:

```typescript
  getAIHistory?(limit?: number): import('../ai/index.js').AIInsight[]
```

- [ ] **Step 2: Add /v1/ai/history route**

In `src/health/api.ts`, in the `createApi` function, after the `/v1/ai` route block, add:

```typescript
      } else if (path === '/v1/ai/history') {
        const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 100)
        const history = data.getAIHistory?.(limit) ?? []
        respond(res, 200, history)
```

- [ ] **Step 3: Wire getAIHistory in main.ts data source**

In `src/main.ts`, add to the `dataSource` object:

```typescript
  getAIHistory: (limit?: number) => keeper.getAIHistory(limit),
```

- [ ] **Step 4: Build and test**

```bash
cd ~/local-dev/nanuqfi-keeper && pnpm build && pnpm test
```

Expected: Clean build, ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add src/health/api.ts src/main.ts
git commit -m "feat: add /v1/ai/history endpoint for AI insight timeline"
```

---

### Task 3: Keeper — VPS Docker Volume + Deploy

**Files:**
- Modify: VPS docker-compose.yml

- [ ] **Step 1: Push keeper changes**

```bash
cd ~/local-dev/nanuqfi-keeper && git push origin main
```

- [ ] **Step 2: Update VPS docker-compose with volume**

```bash
ssh reclabs3 "cat > /home/nanuqfi/keeper/docker-compose.yml << 'EOF'
name: nanuqfi-keeper
services:
  keeper:
    image: ghcr.io/nanuqfi/nanuqfi-keeper:main
    container_name: nanuqfi-keeper
    restart: always
    ports:
      - \"9000:3000\"
    environment:
      - DRIFT_RPC_URL=https://api.devnet.solana.com
      - DRIFT_ENV=devnet
      - PORT=3000
      - OPENROUTER_API_KEY=\${OPENROUTER_API_KEY}
      - AI_BASE_URL=https://openrouter.ai/api
      - AI_MODEL=anthropic/claude-sonnet-4-6
      - AI_HISTORY_PATH=/data/ai-history.json
    volumes:
      - nanuqfi-keeper-data:/data
    healthcheck:
      test: [\"CMD\", \"node\", \"-e\", \"fetch('http://localhost:3000/v1/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))\"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s

volumes:
  nanuqfi-keeper-data:
EOF
"
```

Note: Use an `.env` file on the VPS for the OPENROUTER_API_KEY rather than hardcoding it in the compose file.

- [ ] **Step 3: Create .env file on VPS**

```bash
ssh reclabs3 "echo 'OPENROUTER_API_KEY=sk-or-v1-...' > /home/nanuqfi/keeper/.env"
```

- [ ] **Step 4: Wait for CI/CD, then restart keeper**

```bash
ssh reclabs3 "cd /home/nanuqfi/keeper && docker compose pull && docker compose up -d"
```

- [ ] **Step 5: Verify endpoints**

```bash
curl -s https://keeper.nanuqfi.com/v1/ai | python3 -m json.tool
curl -s https://keeper.nanuqfi.com/v1/ai/history | python3 -m json.tool
```

---

### Task 4: App — useAIInsight Hook

**Files:**
- Modify: `~/local-dev/nanuqfi-app/src/hooks/use-keeper-api.ts`

- [ ] **Step 1: Add AIInsightData type after existing types**

```typescript
export interface AIInsightData {
  available: boolean
  insight: {
    strategies: Record<string, number>
    riskElevated: boolean
    reasoning: string
    timestamp: number
  } | null
}
```

- [ ] **Step 2: Add useAIInsight hook after existing hooks**

```typescript
/**
 * AI strategy assessment — confidence scores, risk flag, reasoning.
 * Polls every 30s.
 */
export function useAIInsight(): KeeperHookResult<AIInsightData> {
  return useKeeperData<AIInsightData>('/v1/ai')
}
```

- [ ] **Step 3: Build to verify**

```bash
cd ~/local-dev/nanuqfi-app && pnpm build
```

Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-keeper-api.ts
git commit -m "feat: add useAIInsight hook for AI transparency data"
```

---

### Task 5: App — ConfidenceBar Component

**Files:**
- Create: `~/local-dev/nanuqfi-app/src/components/confidence-bar.tsx`

- [ ] **Step 1: Create ConfidenceBar component**

```tsx
interface ConfidenceBarProps {
  strategy: string
  value: number
}

function getBarColor(value: number): string {
  if (value > 0.7) return 'bg-emerald-500'
  if (value >= 0.4) return 'bg-amber-500'
  return 'bg-red-500'
}

export function ConfidenceBar({ strategy, value }: ConfidenceBarProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-sm text-slate-400 truncate">
        {strategy}
      </span>
      <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${getBarColor(value)}`}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right font-mono text-xs text-slate-400">
        {(value * 100).toFixed(0)}%
      </span>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/confidence-bar.tsx
git commit -m "feat: ConfidenceBar component for AI strategy confidence display"
```

---

### Task 6: App — AIInsightCard Component

**Files:**
- Create: `~/local-dev/nanuqfi-app/src/components/ai-insight-card.tsx`

- [ ] **Step 1: Create AIInsightCard component**

```tsx
'use client'

import { useState } from 'react'
import { Brain, ChevronDown, ChevronUp } from 'lucide-react'
import { ConfidenceBar } from './confidence-bar'

const STRATEGY_NAMES: Record<string, string> = {
  'drift-lending': 'USDC Lending',
  'drift-basis': 'Basis Trade',
  'drift-funding': 'Funding Rate',
  'drift-jito-dn': 'JitoSOL DN',
}

interface AIInsightCardProps {
  insight: {
    strategies: Record<string, number>
    riskElevated: boolean
    reasoning: string
    timestamp: number
  } | null
  available: boolean
  filterStrategies?: string[]
}

export function AIInsightCard({ insight, available, filterStrategies }: AIInsightCardProps) {
  const [expanded, setExpanded] = useState(false)

  if (!available || !insight) {
    return (
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Brain className="h-4 w-4" />
          <span>AI assessment unavailable</span>
        </div>
      </div>
    )
  }

  const strategies = filterStrategies
    ? Object.entries(insight.strategies).filter(([k]) => filterStrategies.includes(k))
    : Object.entries(insight.strategies)

  const age = Date.now() - insight.timestamp
  const ageMinutes = Math.floor(age / 60_000)
  const ageLabel = ageMinutes < 60
    ? `${ageMinutes}m ago`
    : `${Math.floor(ageMinutes / 60)}h ${ageMinutes % 60}m ago`

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6 backdrop-blur-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-sky-400" />
          <span className="text-sm font-medium text-white">AI Assessment</span>
          <span
            className={`h-2 w-2 rounded-full ${insight.riskElevated ? 'bg-red-500' : 'bg-emerald-500'}`}
          />
          <span className="text-xs text-slate-500">
            {insight.riskElevated ? 'Risk Elevated' : 'Normal'}
          </span>
        </div>
        <span className="text-xs text-slate-500">{ageLabel}</span>
      </div>

      <div className="space-y-2">
        {strategies.map(([key, value]) => (
          <ConfidenceBar
            key={key}
            strategy={STRATEGY_NAMES[key] ?? key}
            value={value}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex cursor-pointer items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? 'Hide reasoning' : 'Show reasoning'}
      </button>

      {expanded && (
        <p className="text-sm text-slate-400 leading-relaxed">
          {insight.reasoning}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Export from barrel**

Add to `src/components/index.ts`:

```typescript
export { ConfidenceBar } from './confidence-bar'
export { AIInsightCard } from './ai-insight-card'
```

- [ ] **Step 3: Build to verify**

```bash
cd ~/local-dev/nanuqfi-app && pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ai-insight-card.tsx src/components/index.ts
git commit -m "feat: AIInsightCard component with confidence bars and reasoning"
```

---

### Task 7: App — Pitch Page Live Tab Integration

**Files:**
- Modify: `~/local-dev/nanuqfi-app/src/components/pitch/LiveProof.tsx`

- [ ] **Step 1: Add imports**

Add at top of LiveProof.tsx:

```typescript
import { useAIInsight } from '@/hooks/use-keeper-api'
import { AIInsightCard } from '@/components/ai-insight-card'
```

- [ ] **Step 2: Add AI section in the LiveProof component**

In the `LiveProof()` function, add the `useAIInsight()` hook call alongside existing hooks:

```typescript
  const aiInsight = useAIInsight()
```

Then add the AI Assessment card as a full-width section. Find the 2-column grid that wraps the 4 existing cards and add the AIInsightCard BEFORE that grid:

```tsx
        <FadeIn delay={100}>
          <AIInsightCard
            insight={aiInsight.data?.insight ?? null}
            available={aiInsight.data?.available ?? false}
          />
        </FadeIn>
```

- [ ] **Step 3: Build and verify**

```bash
cd ~/local-dev/nanuqfi-app && pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/pitch/LiveProof.tsx
git commit -m "feat: add AI Assessment card to pitch page Live tab"
```

---

### Task 8: App — Vault Detail Page Integration

**Files:**
- Modify: `~/local-dev/nanuqfi-app/src/app/(app)/vaults/[riskLevel]/page.tsx`

- [ ] **Step 1: Add imports**

Add at top:

```typescript
import { useAIInsight } from '@/hooks/use-keeper-api'
import { AIInsightCard } from '@/components/ai-insight-card'
```

- [ ] **Step 2: Add hook call**

Add alongside existing hooks in the vault detail component:

```typescript
  const aiInsight = useAIInsight()
```

- [ ] **Step 3: Add AI Assessment section after Allocation Breakdown**

Find the "Allocation Breakdown" section and add after it (before Guardrails):

```tsx
        {/* AI Assessment */}
        <Card>
          <h3 className="text-sm font-medium text-slate-300 mb-4">AI Strategy Assessment</h3>
          <AIInsightCard
            insight={aiInsight.data?.insight ?? null}
            available={aiInsight.data?.available ?? false}
            filterStrategies={Object.keys(weights)}
          />
        </Card>
```

Note: `weights` is the allocation weights variable already in scope from the existing code — this filters the confidence bars to only show strategies active in this vault.

- [ ] **Step 4: Build and verify**

```bash
cd ~/local-dev/nanuqfi-app && pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/vaults/\[riskLevel\]/page.tsx
git commit -m "feat: add AI Strategy Assessment to vault detail page"
```

---

### Task 9: App — Activity Page Integration

**Files:**
- Modify: `~/local-dev/nanuqfi-app/src/app/(app)/activity/page.tsx`

- [ ] **Step 1: Add imports**

Add at top:

```typescript
import { useAIInsight } from '@/hooks/use-keeper-api'
import { AIInsightCard } from '@/components/ai-insight-card'
```

- [ ] **Step 2: Add AI Assessment section above the decision feed**

In the `ActivityPage()` component, add the hook:

```typescript
  const aiInsight = useAIInsight()
```

Add the AI card after the header and before the decision feed:

```tsx
        {/* AI Assessment */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6 backdrop-blur-sm">
          <AIInsightCard
            insight={aiInsight.data?.insight ?? null}
            available={aiInsight.data?.available ?? false}
          />
        </div>
```

- [ ] **Step 3: Add expandable AI reasoning to decision rows**

In the decision rendering loop, after the existing reason/summary display, add a conditional AI reasoning block for decisions that have `aiInvolved: true`:

```tsx
                {d.aiInvolved && d.reason && (
                  <p className="mt-2 text-xs text-sky-400/70 italic">
                    AI: {d.reason}
                  </p>
                )}
```

- [ ] **Step 4: Build and verify**

```bash
cd ~/local-dev/nanuqfi-app && pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/activity/page.tsx
git commit -m "feat: add AI Assessment and reasoning to activity page"
```

---

### Task 10: App — Tests + Final Deploy

- [ ] **Step 1: Run all app tests**

```bash
cd ~/local-dev/nanuqfi-app && pnpm test
```

- [ ] **Step 2: Run build**

```bash
cd ~/local-dev/nanuqfi-app && pnpm build
```

- [ ] **Step 3: Push app changes**

```bash
cd ~/local-dev/nanuqfi-app && git push origin main
```

- [ ] **Step 4: Wait for both CI/CD pipelines to complete**

```bash
gh run list -R nanuqfi/nanuqfi-keeper --limit 1
gh run list -R nanuqfi/nanuqfi-app --limit 1
```

- [ ] **Step 5: Verify live**

```bash
# Keeper API
curl -s https://keeper.nanuqfi.com/v1/ai | python3 -m json.tool
curl -s 'https://keeper.nanuqfi.com/v1/ai/history?limit=5' | python3 -m json.tool

# Visual checks
# - https://app.nanuqfi.com/pitch → Live tab → AI Assessment card
# - https://app.nanuqfi.com/vaults/moderate → AI Strategy Assessment section
# - https://app.nanuqfi.com/activity → AI Assessment + reasoning in decisions
```
