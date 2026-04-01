# Pitch Page Tab Revamp — Design Spec

**Context:** Revamp the existing `/pitch` page from a single long scrolling page to a hybrid hero + tabbed layout. All section components already exist — this is a restructure, not a rebuild.

---

## Layout Structure

```
┌─────────────────────────────────────┐
│            Hero (full-width)         │
│   "Yield, Routed." + counters       │
│   "by RECTOR" in subtitle           │
├─────────────────────────────────────┤
│  [Overview] [Strategy] [Performance] │  ← sticky pill tab bar
│  [Live] [Proof]                      │
├─────────────────────────────────────┤
│                                     │
│         Tab content panel            │  ← fades on switch
│   (one section at a time)            │
│                                     │
└─────────────────────────────────────┘
```

Hero is always visible at the top (no tab needed). Below it, a sticky tab bar lets judges jump directly to the section they care about. Only one tab's content is rendered at a time with a 200ms fade transition.

---

## Hero Changes

- Remove the standalone "Built by RECTOR" `<p>` at the bottom of the hero
- Add "by RECTOR" inline in the subtitle: "AI-powered yield routing across Drift Protocol. by RECTOR" — "RECTOR" links to `https://github.com/rz1989s`, styled as `text-slate-300 hover:text-slate-100`
- All other hero content unchanged (headline, counters, radial gradient, FadeIn animations)

---

## Tab Bar Component

New file: `src/components/pitch/TabBar.tsx`

**Props:**
```ts
interface TabBarProps {
  tabs: string[]
  activeTab: string
  onTabChange: (tab: string) => void
}
```

**Styling:**
- Container: `flex gap-2 justify-center py-4`, sticky below hero (`sticky top-0 z-20 bg-slate-950/95 backdrop-blur-sm`)
- Active pill: `bg-sky-500/20 text-sky-400 px-5 py-2 rounded-full text-sm font-medium transition-all`
- Inactive pill: `text-slate-400 px-5 py-2 rounded-full text-sm font-medium hover:text-slate-200 hover:bg-slate-800/50 transition-all`
- Border below: `border-b border-slate-800/50`

**Behavior:**
- Clicking a tab calls `onTabChange` with the tab name
- Tab bar sticks when user scrolls past the hero section
- No URL change (purely client-side state, not route-based tabs)

---

## Tab Content Mapping

| Tab | Component(s) Rendered | Default? |
|---|---|---|
| Overview | `<Architecture />` | Yes |
| Strategy | `<StrategyEngine />` | |
| Performance | `<BacktestResults />` | |
| Live | `<LiveProof />` | |
| Proof | `<WhyNanuqfi />` + `<LinksAndProof />` | |

All existing section components are reused as-is. No modifications to their internal logic or content.

---

## Tab Content Transitions

- Wrap the content panel in a container with `transition-opacity duration-200`
- On tab switch: set opacity to 0, wait 200ms, swap content, set opacity to 1
- Implementation: `useState` for active tab + `useState` for fade state
- Simple approach:
  ```
  onClick → setFading(true) → setTimeout(200ms) → setActiveTab(newTab) + setFading(false)
  ```
- Container class: `transition-opacity duration-200 ${fading ? 'opacity-0' : 'opacity-100'}`

---

## Page Orchestrator Changes

File: `src/app/pitch/page.tsx`

**Before:** Linear stack of sections with `<Divider />` between each
**After:** Hero at top, TabBar below, conditional content panel

```tsx
'use client'
import { useState } from 'react'
import { Hero } from '@/components/pitch/Hero'
import { TabBar } from '@/components/pitch/TabBar'
// ... all section imports

const TABS = ['Overview', 'Strategy', 'Performance', 'Live', 'Proof']

export default function PitchPage() {
  const [activeTab, setActiveTab] = useState('Overview')
  const [fading, setFading] = useState(false)

  function handleTabChange(tab: string) {
    if (tab === activeTab) return
    setFading(true)
    setTimeout(() => {
      setActiveTab(tab)
      setFading(false)
    }, 200)
  }

  return (
    <main>
      <Hero />
      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={handleTabChange} />
      <div className={`transition-opacity duration-200 ${fading ? 'opacity-0' : 'opacity-100'}`}>
        {activeTab === 'Overview' && <Architecture />}
        {activeTab === 'Strategy' && <StrategyEngine />}
        {activeTab === 'Performance' && <BacktestResults />}
        {activeTab === 'Live' && <LiveProof />}
        {activeTab === 'Proof' && (
          <>
            <WhyNanuqfi />
            <LinksAndProof />
          </>
        )}
      </div>
    </main>
  )
}
```

**Removed:**
- `Divider` component (no longer needed)
- Linear section rendering
- `page.tsx` becomes a `'use client'` component (was server component before)

---

## FadeIn Scroll Animations

The existing `FadeIn` wrappers inside each section component still work — they trigger on IntersectionObserver, which fires when the component mounts into view. When switching tabs, the new section fades in (tab transition) and its internal FadeIn animations trigger as elements enter the viewport. This is natural behavior, no changes needed.

---

## Files Changed

| File | Action | Change |
|---|---|---|
| `src/components/pitch/TabBar.tsx` | Create | New pill tab bar component |
| `src/app/pitch/page.tsx` | Modify | Replace linear layout with tab state + conditional rendering |
| `src/components/pitch/Hero.tsx` | Modify | Remove bottom attribution, add "by RECTOR" in subtitle |
| All section components | No change | Rendered conditionally, internals unchanged |

**Total: 1 new file, 2 modified files.**

---

## Scope Boundaries

**In scope:**
- Tab bar component with pill styling
- Page orchestrator restructure
- Hero attribution change
- Fade transition between tabs

**Out of scope:**
- URL-based routing per tab (no `/pitch/strategy` routes)
- Mobile-responsive tab bar (desktop-first)
- Keyboard navigation between tabs
- Tab content lazy loading (all components mount eagerly)
