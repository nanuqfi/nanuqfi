# NanuqFi Marketing Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a marketing landing page at `nanuqfi.com` — the public front door to NanuqFi.

**Architecture:** Single-page scroll site with 4 sections (Hero + How It Works + Trust Signals + Footer). Next.js 16 static export served by nginx in Docker. Interactive particle canvas background, scroll-triggered animations, animated counters.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4 (CSS-based config), TypeScript 5, Geist fonts, Lucide React, Vitest, Docker + nginx, GitHub Actions CI/CD.

**Spec:** `docs/superpowers/specs/2026-04-03-marketing-site-design.md`

---

## File Structure

```
nanuqfi-web/
├── src/
│   ├── app/
│   │   ├── globals.css             # Tailwind imports + theme vars
│   │   ├── layout.tsx              # Root layout (fonts, metadata, OG)
│   │   └── page.tsx                # Single page composing all sections
│   └── components/
│       ├── particle-canvas.tsx     # Canvas constellation particle system
│       ├── animated-counter.tsx    # Count-up number animation
│       ├── fade-in.tsx             # IntersectionObserver scroll reveal
│       ├── hero.tsx                # Hero section
│       ├── how-it-works.tsx        # 3-step flow section
│       ├── trust-signals.tsx       # Metrics grid section
│       └── footer.tsx              # Footer section
├── src/__tests__/
│   ├── animated-counter.test.tsx   # Counter logic tests
│   ├── fade-in.test.tsx            # FadeIn rendering test
│   └── sections.test.tsx           # All sections render without error
├── public/
│   ├── og.png                      # Open Graph image (1200x630)
│   ├── robots.txt                  # Allow all
│   └── sitemap.xml                 # Single URL
├── next.config.ts                  # output: 'export'
├── tsconfig.json
├── postcss.config.mjs
├── package.json
├── Dockerfile
├── docker-compose.yml
├── .github/
│   └── workflows/
│       └── deploy.yml
├── CLAUDE.md
└── .gitignore
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `.gitignore`

- [ ] **Step 1: Create GitHub repo and clone**

```bash
gh repo create nanuqfi/nanuqfi-web --public --clone
cd ~/local-dev/nanuqfi-web
```

- [ ] **Step 2: Initialize package.json**

```json
{
  "name": "nanuqfi-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "lucide-react": "^0.577.0",
    "next": "16.1.6",
    "react": "19.2.3",
    "react-dom": "19.2.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.3.0",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^4.5.2",
    "eslint": "^9",
    "eslint-config-next": "16.1.6",
    "jsdom": "^26.1.0",
    "tailwindcss": "^4",
    "typescript": "^5",
    "vitest": "^4.1.0"
  },
  "packageManager": "pnpm@10.6.5"
}
```

- [ ] **Step 3: Create next.config.ts**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
};

export default nextConfig;
```

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 5: Create postcss.config.mjs**

```javascript
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

- [ ] **Step 6: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: [],
    globals: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 7: Create .gitignore**

```
node_modules/
.next/
out/
*.tsbuildinfo
.env*.local
```

- [ ] **Step 8: Install dependencies**

```bash
pnpm install
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 16 project with Tailwind 4 + Vitest"
```

---

### Task 2: Root Layout + Global Styles

**Files:**
- Create: `src/app/globals.css`, `src/app/layout.tsx`

- [ ] **Step 1: Create globals.css**

```css
@import "tailwindcss";

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

:root {
  --background: #0f172a;
  --foreground: #f8fafc;
}

body {
  background: var(--background);
  color: var(--foreground);
}

html {
  scroll-behavior: smooth;
}
```

- [ ] **Step 2: Create layout.tsx**

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NanuqFi — Yield, Routed.",
  description:
    "AI-powered yield routing for DeFi. Deposit USDC, pick your risk, earn optimized yield across 50+ protocols.",
  openGraph: {
    title: "NanuqFi — Yield, Routed.",
    description:
      "AI-powered yield routing for DeFi. Deposit USDC, pick your risk, earn optimized yield across 50+ protocols.",
    url: "https://nanuqfi.com",
    siteName: "NanuqFi",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NanuqFi — Yield, Routed.",
    description:
      "AI-powered yield routing for DeFi. Deposit USDC, pick your risk, earn optimized yield across 50+ protocols.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Create placeholder page.tsx**

```tsx
export default function Home() {
  return <main className="min-h-screen bg-background text-foreground">NanuqFi</main>;
}
```

- [ ] **Step 4: Verify build works**

```bash
pnpm build
```

Expected: Static export succeeds, `out/` directory created with `index.html`.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx src/app/page.tsx
git commit -m "feat: root layout with Geist fonts, Tailwind 4 theme, and SEO metadata"
```

---

### Task 3: FadeIn Component

**Files:**
- Create: `src/components/fade-in.tsx`, `src/__tests__/fade-in.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
// src/__tests__/fade-in.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { FadeIn } from "@/components/fade-in";

// Mock IntersectionObserver
beforeEach(() => {
  const mockObserver = {
    observe: () => {},
    unobserve: () => {},
    disconnect: () => {},
  };
  global.IntersectionObserver = class {
    constructor(public callback: IntersectionObserverCallback) {}
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
});

describe("FadeIn", () => {
  it("renders children", () => {
    render(
      <FadeIn>
        <span>Hello</span>
      </FadeIn>
    );
    expect(screen.getByText("Hello")).toBeDefined();
  });

  it("starts with opacity-0", () => {
    const { container } = render(
      <FadeIn>
        <span>Hello</span>
      </FadeIn>
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.opacity).toBe("0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/__tests__/fade-in.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement FadeIn**

```tsx
// src/components/fade-in.tsx
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

export function FadeIn({ children, delay = 0, className = "" }: FadeInProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: `opacity 600ms ease-out ${delay}ms, transform 600ms ease-out ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test src/__tests__/fade-in.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/fade-in.tsx src/__tests__/fade-in.test.tsx
git commit -m "feat: FadeIn component with IntersectionObserver scroll reveal"
```

---

### Task 4: AnimatedCounter Component

**Files:**
- Create: `src/components/animated-counter.tsx`, `src/__tests__/animated-counter.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
// src/__tests__/animated-counter.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { AnimatedCounter } from "@/components/animated-counter";

beforeEach(() => {
  global.IntersectionObserver = class {
    constructor(public callback: IntersectionObserverCallback) {}
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
});

describe("AnimatedCounter", () => {
  it("renders the label", () => {
    render(<AnimatedCounter value={16.1} label="Moderate Strategy" suffix="% APY" />);
    expect(screen.getByText("Moderate Strategy")).toBeDefined();
  });

  it("renders with initial value 0 before animation", () => {
    const { container } = render(
      <AnimatedCounter value={50} label="Protocols" />
    );
    const valueEl = container.querySelector("[data-testid='counter-value']");
    expect(valueEl?.textContent).toContain("0");
  });

  it("renders the suffix when provided", () => {
    render(<AnimatedCounter value={16.1} label="Test" suffix="% APY" />);
    // Before animation triggers, suffix is still rendered
    expect(screen.getByText(/% APY/)).toBeDefined();
  });

  it("renders the prefix when provided", () => {
    render(<AnimatedCounter value={50} label="Test" prefix=">" />);
    expect(screen.getByText(/>/)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/__tests__/animated-counter.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement AnimatedCounter**

```tsx
// src/components/animated-counter.tsx
"use client";

import { useEffect, useRef, useState } from "react";

interface AnimatedCounterProps {
  value: number;
  label: string;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  duration?: number;
}

export function AnimatedCounter({
  value,
  label,
  suffix = "",
  prefix = "",
  decimals = 0,
  duration = 1500,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;

    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(eased * value);

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        setCurrent(value);
      }
    }

    requestAnimationFrame(tick);
  }, [started, value, duration]);

  return (
    <div ref={ref} className="text-center">
      <div
        data-testid="counter-value"
        className="font-mono text-3xl font-bold text-white tabular-nums"
      >
        {prefix}
        {current.toFixed(decimals)}
        {suffix}
      </div>
      <div className="mt-1 text-sm text-slate-400">{label}</div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test src/__tests__/animated-counter.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/animated-counter.tsx src/__tests__/animated-counter.test.tsx
git commit -m "feat: AnimatedCounter with IntersectionObserver trigger and ease-out animation"
```

---

### Task 5: ParticleCanvas Component

**Files:**
- Create: `src/components/particle-canvas.tsx`

No unit test for canvas rendering — canvas API is not available in jsdom. Visual verification via `pnpm dev`.

- [ ] **Step 1: Implement ParticleCanvas**

```tsx
// src/components/particle-canvas.tsx
"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

const PARTICLE_COUNT = 100;
const CONNECTION_DISTANCE = 150;
const MOUSE_RADIUS = 200;
const PARTICLE_COLOR = "14, 165, 233"; // sky-500 RGB
const LINE_COLOR = "71, 85, 105"; // slate-600 RGB

export function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
    }

    resize();
    window.addEventListener("resize", resize);

    // Initialize particles
    particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      radius: Math.random() * 1.5 + 1,
    }));

    function handleMouseMove(e: MouseEvent) {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    }

    function handleMouseLeave() {
      mouseRef.current = { x: -1000, y: -1000 };
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);

    function animate() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const particles = particlesRef.current;
      const mouse = mouseRef.current;

      for (const p of particles) {
        // Mouse repulsion
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MOUSE_RADIUS && dist > 0) {
          const force = (MOUSE_RADIUS - dist) / MOUSE_RADIUS;
          p.vx += (dx / dist) * force * 0.02;
          p.vy += (dy / dist) * force * 0.02;
        }

        // Update position
        p.x += p.vx;
        p.y += p.vy;

        // Damping
        p.vx *= 0.99;
        p.vy *= 0.99;

        // Wrap edges
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        // Draw particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${PARTICLE_COLOR}, 0.3)`;
        ctx.fill();
      }

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < CONNECTION_DISTANCE) {
            const opacity = (1 - dist / CONNECTION_DISTANCE) * 0.15;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(${LINE_COLOR}, ${opacity})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animRef.current = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 -z-10"
      aria-hidden="true"
    />
  );
}
```

- [ ] **Step 2: Verify visually**

```bash
pnpm dev
```

Open `http://localhost:3000`. Temporarily import `<ParticleCanvas />` in `page.tsx` to confirm particles render and respond to mouse movement. Remove temporary import after verification.

- [ ] **Step 3: Commit**

```bash
git add src/components/particle-canvas.tsx
git commit -m "feat: interactive particle canvas with constellation lines and mouse repulsion"
```

---

### Task 6: Hero Section

**Files:**
- Create: `src/components/hero.tsx`

- [ ] **Step 1: Implement Hero**

```tsx
// src/components/hero.tsx
import { Cpu } from "lucide-react";
import { AnimatedCounter } from "./animated-counter";
import { FadeIn } from "./fade-in";

export function Hero() {
  return (
    <section className="relative flex min-h-screen items-center justify-center px-6">
      {/* Radial gradient overlay */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 0%, rgb(15 23 42) 70%)",
        }}
      />

      <div className="mx-auto max-w-4xl text-center">
        <FadeIn delay={0}>
          <p className="text-sm font-medium uppercase tracking-widest text-sky-400">
            AI-Powered DeFi
          </p>
        </FadeIn>

        <FadeIn delay={100}>
          <h1 className="mt-4 text-5xl font-bold text-white md:text-7xl">
            Yield, Routed.
          </h1>
        </FadeIn>

        <FadeIn delay={200}>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400 md:text-xl">
            Deposit USDC. Pick your risk. Let the AI route to the best yield
            across DeFi.
          </p>
        </FadeIn>

        <FadeIn delay={300}>
          <div className="mt-12 flex flex-col items-center justify-center gap-8 sm:flex-row">
            <AnimatedCounter
              value={16.1}
              label="Moderate Strategy"
              suffix="% APY"
              decimals={1}
            />
            <AnimatedCounter
              value={19.4}
              label="Aggressive Strategy"
              suffix="% APY"
              decimals={1}
            />
            <AnimatedCounter
              value={50}
              label="Protocols Scanned"
              prefix=""
              suffix="+"
            />
          </div>
        </FadeIn>

        <FadeIn delay={400}>
          <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="https://app.nanuqfi.com"
              className="rounded-lg bg-sky-500 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-sky-400"
            >
              Launch App &rarr;
            </a>
            <a
              href="https://app.nanuqfi.com/pitch"
              className="rounded-lg border border-slate-600 px-6 py-3 text-sm font-medium text-slate-300 transition-colors hover:border-sky-500 hover:text-white"
            >
              View Pitch &rarr;
            </a>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/hero.tsx
git commit -m "feat: Hero section with animated counters, CTAs, and staggered fade-in"
```

---

### Task 7: How It Works Section

**Files:**
- Create: `src/components/how-it-works.tsx`

- [ ] **Step 1: Implement HowItWorks**

```tsx
// src/components/how-it-works.tsx
import { Wallet, Cpu, TrendingUp } from "lucide-react";
import { FadeIn } from "./fade-in";

const steps = [
  {
    icon: Wallet,
    title: "Deposit USDC",
    description:
      "Choose a risk vault — conservative, moderate, or aggressive. Your capital stays in the on-chain allocator program.",
  },
  {
    icon: Cpu,
    title: "AI Routes Capital",
    description:
      "The keeper bot scans 50+ protocols, the algorithm engine picks optimal allocations, on-chain guardrails enforce limits.",
  },
  {
    icon: TrendingUp,
    title: "Earn Yield",
    description:
      "Capital flows to the best risk-adjusted yield. Auto-exit triggers protect against drawdowns. Withdraw anytime.",
  },
] as const;

export function HowItWorks() {
  return (
    <section className="border-t border-slate-800/50 px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <FadeIn>
          <h2 className="text-center text-4xl font-bold text-white">
            How It Works
          </h2>
          <p className="mt-4 text-center text-lg text-slate-400">
            Three steps. Fully on-chain. No trust required.
          </p>
        </FadeIn>

        <div className="relative mt-16 grid grid-cols-1 gap-12 md:grid-cols-3">
          {/* Connector line (desktop only) */}
          <div className="absolute top-8 right-1/3 left-1/3 hidden h-px md:block">
            <div
              className="h-full w-full"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(to right, rgb(56 189 248 / 0.3) 0, rgb(56 189 248 / 0.3) 6px, transparent 6px, transparent 12px)",
              }}
            />
          </div>

          {steps.map((step, i) => (
            <FadeIn key={step.title} delay={i * 150}>
              <div className="flex flex-col items-center text-center">
                <step.icon className="h-12 w-12 text-sky-500" strokeWidth={1.5} />
                <h3 className="mt-4 text-lg font-semibold text-white">
                  {step.title}
                </h3>
                <p className="mt-2 max-w-xs text-sm text-slate-400">
                  {step.description}
                </p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/how-it-works.tsx
git commit -m "feat: How It Works section with 3-step flow and dashed connector"
```

---

### Task 8: Trust Signals Section

**Files:**
- Create: `src/components/trust-signals.tsx`

- [ ] **Step 1: Implement TrustSignals**

```tsx
// src/components/trust-signals.tsx
import { Github } from "lucide-react";
import { AnimatedCounter } from "./animated-counter";
import { FadeIn } from "./fade-in";

const metrics = [
  { value: 23, label: "On-chain Instructions" },
  { value: 102, label: "Devnet Tests Passing", suffix: "/107" },
  { value: 50, label: "Protocols Scanned", suffix: "+" },
  { value: 4, label: "Yield Strategies" },
  { value: 445, label: "Keeper Cycles, 0 Failures", suffix: "+" },
  { value: 3, label: "Open Source Repos" },
] as const;

export function TrustSignals() {
  return (
    <section
      className="px-6 py-24"
      style={{
        background:
          "linear-gradient(to bottom, rgb(2 6 23), rgb(15 23 42 / 0.5))",
      }}
    >
      <div className="mx-auto max-w-5xl">
        <FadeIn>
          <h2 className="text-center text-4xl font-bold text-white">
            Built to Be Audited
          </h2>
          <p className="mt-4 text-center text-lg text-slate-400">
            Every line of code, every decision, every guardrail — open and
            verifiable.
          </p>
        </FadeIn>

        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map((metric, i) => (
            <FadeIn key={metric.label} delay={i * 100}>
              <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6 text-center backdrop-blur-sm">
                <div className="font-mono text-4xl font-bold tabular-nums text-white">
                  {metric.suffix === "/107" ? (
                    // Special case: "102/107" — animate 102, append /107
                    <>
                      <AnimatedCounter
                        value={metric.value}
                        label=""
                        suffix=""
                      />
                      <span className="text-slate-500">/107</span>
                    </>
                  ) : (
                    <AnimatedCounter
                      value={metric.value}
                      label=""
                      suffix={metric.suffix ?? ""}
                    />
                  )}
                </div>
                <div className="mt-2 text-sm text-slate-400">
                  {metric.label}
                </div>
              </div>
            </FadeIn>
          ))}
        </div>

        <FadeIn delay={600}>
          <div className="mt-12 flex items-center justify-center gap-2 text-sm text-slate-500">
            <Github className="h-4 w-4" />
            <a
              href="https://github.com/nanuqfi"
              className="transition-colors hover:text-sky-400"
              target="_blank"
              rel="noopener noreferrer"
            >
              Fully open source
            </a>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
```

Note: The `102/107` metric needs special handling — the AnimatedCounter renders its own label, but here we want the label below the card, not inline. We need a small refactor: extract the counter value rendering from the label. **Simpler approach** — just use the AnimatedCounter inline without its label (pass empty label), and render the card label separately. The AnimatedCounter already supports `label=""`. However, the current AnimatedCounter renders `<div className="text-center">` as its wrapper which adds extra nesting inside the card. **Fix:** adjust the metric cards to not use AnimatedCounter for the display — instead use a simpler inline counter hook. But this adds complexity. **Pragmatic solution:** just hardcode the metric values in the glass cards and animate them on scroll. The AnimatedCounter was designed for the hero. For the trust signals grid, use a simpler approach:

**Revised implementation — replace the above with:**

```tsx
// src/components/trust-signals.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Github } from "lucide-react";
import { FadeIn } from "./fade-in";

const metrics = [
  { value: 23, label: "On-chain Instructions", display: "23" },
  { value: 102, label: "Devnet Tests Passing", display: "102/107" },
  { value: 50, label: "Protocols Scanned", display: "50+" },
  { value: 4, label: "Yield Strategies", display: "4" },
  { value: 445, label: "Keeper Cycles, 0 Failures", display: "445+" },
  { value: 3, label: "Open Source Repos", display: "3" },
] as const;

function useCountUp(target: number, duration = 1500) {
  const ref = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
      else setCurrent(target);
    }

    requestAnimationFrame(tick);
  }, [started, target, duration]);

  return { ref, current };
}

export function TrustSignals() {
  return (
    <section
      className="px-6 py-24"
      style={{
        background:
          "linear-gradient(to bottom, rgb(2 6 23), rgb(15 23 42 / 0.5))",
      }}
    >
      <div className="mx-auto max-w-5xl">
        <FadeIn>
          <h2 className="text-center text-4xl font-bold text-white">
            Built to Be Audited
          </h2>
          <p className="mt-4 text-center text-lg text-slate-400">
            Every line of code, every decision, every guardrail — open and
            verifiable.
          </p>
        </FadeIn>

        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map((metric, i) => (
            <MetricCard key={metric.label} metric={metric} delay={i * 100} />
          ))}
        </div>

        <FadeIn delay={600}>
          <div className="mt-12 flex items-center justify-center gap-2 text-sm text-slate-500">
            <Github className="h-4 w-4" />
            <a
              href="https://github.com/nanuqfi"
              className="transition-colors hover:text-sky-400"
              target="_blank"
              rel="noopener noreferrer"
            >
              Fully open source
            </a>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

function MetricCard({
  metric,
  delay,
}: {
  metric: (typeof metrics)[number];
  delay: number;
}) {
  const { ref, current } = useCountUp(metric.value);

  // Build display string: replace numeric part with animated value
  const display = metric.display.replace(
    String(metric.value),
    String(current)
  );

  return (
    <FadeIn delay={delay}>
      <div
        ref={ref}
        className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6 text-center backdrop-blur-sm"
      >
        <div className="font-mono text-4xl font-bold tabular-nums text-white">
          {display}
        </div>
        <div className="mt-2 text-sm text-slate-400">{metric.label}</div>
      </div>
    </FadeIn>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/trust-signals.tsx
git commit -m "feat: Trust Signals section with animated metric cards and glass morphism"
```

---

### Task 9: Footer Section

**Files:**
- Create: `src/components/footer.tsx`

- [ ] **Step 1: Implement Footer**

```tsx
// src/components/footer.tsx
const links = [
  { label: "App", href: "https://app.nanuqfi.com" },
  { label: "Pitch", href: "https://app.nanuqfi.com/pitch" },
  { label: "GitHub", href: "https://github.com/nanuqfi" },
  { label: "Keeper API", href: "https://keeper.nanuqfi.com" },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-slate-800 px-6 py-16">
      <div className="mx-auto max-w-5xl text-center">
        <nav className="flex flex-wrap items-center justify-center gap-8">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm text-slate-400 transition-colors hover:text-sky-400"
              target="_blank"
              rel="noopener noreferrer"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <p className="mt-6 text-xs text-slate-600">
          NanuqFi — Yield, Routed.
        </p>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/footer.tsx
git commit -m "feat: Footer with navigation links and tagline"
```

---

### Task 10: Compose Main Page

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Compose all sections in page.tsx**

```tsx
// src/app/page.tsx
import { ParticleCanvas } from "@/components/particle-canvas";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { TrustSignals } from "@/components/trust-signals";
import { Footer } from "@/components/footer";

export default function Home() {
  return (
    <>
      <ParticleCanvas />
      <main className="relative">
        <Hero />
        <HowItWorks />
        <TrustSignals />
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 2: Run build to verify static export**

```bash
pnpm build
```

Expected: Build succeeds, `out/` directory contains `index.html` with all sections.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: compose marketing page — hero, how it works, trust signals, footer"
```

---

### Task 11: Section Render Tests

**Files:**
- Create: `src/__tests__/sections.test.tsx`

- [ ] **Step 1: Write render tests for all sections**

```tsx
// src/__tests__/sections.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { TrustSignals } from "@/components/trust-signals";
import { Footer } from "@/components/footer";

beforeEach(() => {
  global.IntersectionObserver = class {
    constructor(public callback: IntersectionObserverCallback) {}
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
});

describe("Hero", () => {
  it("renders headline", () => {
    render(<Hero />);
    expect(screen.getByText("Yield, Routed.")).toBeDefined();
  });

  it("renders both CTAs", () => {
    render(<Hero />);
    expect(screen.getByText(/Launch App/)).toBeDefined();
    expect(screen.getByText(/View Pitch/)).toBeDefined();
  });

  it("renders eyebrow text", () => {
    render(<Hero />);
    expect(screen.getByText("AI-Powered DeFi")).toBeDefined();
  });
});

describe("HowItWorks", () => {
  it("renders section title", () => {
    render(<HowItWorks />);
    expect(screen.getByText("How It Works")).toBeDefined();
  });

  it("renders all 3 steps", () => {
    render(<HowItWorks />);
    expect(screen.getByText("Deposit USDC")).toBeDefined();
    expect(screen.getByText("AI Routes Capital")).toBeDefined();
    expect(screen.getByText("Earn Yield")).toBeDefined();
  });
});

describe("TrustSignals", () => {
  it("renders section title", () => {
    render(<TrustSignals />);
    expect(screen.getByText("Built to Be Audited")).toBeDefined();
  });

  it("renders open source callout", () => {
    render(<TrustSignals />);
    expect(screen.getByText("Fully open source")).toBeDefined();
  });
});

describe("Footer", () => {
  it("renders all navigation links", () => {
    render(<Footer />);
    expect(screen.getByText("App")).toBeDefined();
    expect(screen.getByText("Pitch")).toBeDefined();
    expect(screen.getByText("GitHub")).toBeDefined();
    expect(screen.getByText("Keeper API")).toBeDefined();
  });

  it("renders tagline", () => {
    render(<Footer />);
    expect(screen.getByText(/Yield, Routed/)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run all tests**

```bash
pnpm test
```

Expected: All tests pass (fade-in: 2, animated-counter: 4, sections: 8 = 14 total).

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/sections.test.tsx
git commit -m "test: section render tests — hero, how it works, trust signals, footer"
```

---

### Task 12: Static Assets (OG Image, robots.txt, sitemap.xml)

**Files:**
- Create: `public/robots.txt`, `public/sitemap.xml`
- Create: `public/og.png` (placeholder — generate manually or via script)

- [ ] **Step 1: Create robots.txt**

```
User-agent: *
Allow: /
Sitemap: https://nanuqfi.com/sitemap.xml
```

- [ ] **Step 2: Create sitemap.xml**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemapschemas.org/sitemap/0.9">
  <url>
    <loc>https://nanuqfi.com</loc>
    <lastmod>2026-04-03</lastmod>
    <changefreq>weekly</changefreq>
  </url>
</urlset>
```

- [ ] **Step 3: Create OG image**

Create a simple 1200x630 OG image. Options:
- **Quick:** Use a canvas script to generate it, or create manually in Figma/any editor
- **Content:** Dark slate-950 background, "NanuqFi" in Geist Sans bold (white), "Yield, Routed." in sky-400, horizontal sky-500 accent line
- Save as `public/og.png`

If no image tool available, create a minimal placeholder and replace later:

```bash
# Generate a solid dark placeholder (requires ImageMagick)
convert -size 1200x630 xc:"#0f172a" \
  -gravity center -pointsize 72 -fill white -annotate +0-40 "NanuqFi" \
  -pointsize 36 -fill "#38bdf8" -annotate +0+40 "Yield, Routed." \
  public/og.png
```

If ImageMagick is not available, skip and create manually before deploy.

- [ ] **Step 4: Commit**

```bash
git add public/robots.txt public/sitemap.xml public/og.png
git commit -m "chore: add robots.txt, sitemap.xml, and OG image"
```

---

### Task 13: Dockerfile + docker-compose.yml

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
# Build stage
FROM node:22-slim AS builder
RUN corepack enable pnpm
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Production stage — serve static files with nginx
FROM nginx:alpine
COPY --from=builder /app/out /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

- [ ] **Step 2: Create nginx.conf**

```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # Cache static assets aggressively
    location /_next/static/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Cache images
    location ~* \.(png|jpg|jpeg|gif|ico|svg|webp)$ {
        expires 30d;
        add_header Cache-Control "public";
    }

    # SPA fallback
    location / {
        try_files $uri $uri.html $uri/ /index.html;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
```

- [ ] **Step 3: Create docker-compose.yml**

```yaml
name: nanuqfi-web

services:
  web:
    image: ghcr.io/nanuqfi/nanuqfi-web:main
    container_name: nanuqfi-web
    restart: unless-stopped
    ports:
      - "127.0.0.1:3002:80"
```

Port `3002` — avoids conflict with app (`3000`) and keeper (`3001`). Confirm actual port availability on VPS during deploy.

- [ ] **Step 4: Build and test Docker image locally**

```bash
docker build -t nanuqfi-web .
docker run --rm -p 8080:80 nanuqfi-web
```

Open `http://localhost:8080` — verify the full page renders correctly.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile nginx.conf docker-compose.yml
git commit -m "chore: Dockerfile (multi-stage build + nginx) and docker-compose"
```

---

### Task 14: GitHub Actions Deploy Workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create deploy workflow**

```yaml
name: Deploy Web
on:
  push:
    branches: [main]

jobs:
  build-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
      - run: pnpm build
      - run: pnpm lint

  deploy:
    needs: build-test
    runs-on: ubuntu-latest
    permissions:
      packages: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ghcr.io/nanuqfi/nanuqfi-web
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd ${{ secrets.VPS_APP_PATH }}
            docker compose pull
            docker compose up -d
            docker image prune -f
```

- [ ] **Step 2: Verify workflow YAML is valid**

```bash
# Quick syntax check
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))" && echo "Valid YAML"
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: GitHub Actions deploy workflow — build, test, push to GHCR, SSH deploy"
```

---

### Task 15: CLAUDE.md + README

**Files:**
- Create: `CLAUDE.md`, `README.md`

- [ ] **Step 1: Create CLAUDE.md**

```markdown
# CLAUDE.md — NanuqFi Marketing Site

**Repo:** `nanuqfi/nanuqfi-web`
**Purpose:** Public marketing/landing page for `nanuqfi.com`
**Tech Stack:** Next.js 16 (static export), React 19, Tailwind CSS 4, TypeScript 5

## Quick Reference

```bash
pnpm dev          # local dev server
pnpm build        # static export to out/
pnpm test         # run all tests
pnpm lint         # ESLint
```

## Architecture

Single-page scroll site with 4 sections:
1. **Hero** — particle canvas background, headline, animated counters, CTAs
2. **How It Works** — 3-step flow with dashed connectors
3. **Trust Signals** — 6 metric glass cards with count-up animation
4. **Footer** — navigation links + tagline

All data is hardcoded (no API calls). Static export served by nginx in Docker.

## Key Files

- `src/app/page.tsx` — Page composition (imports all sections)
- `src/components/particle-canvas.tsx` — Canvas constellation particle system
- `src/components/animated-counter.tsx` — Count-up number animation
- `src/components/fade-in.tsx` — IntersectionObserver scroll reveal wrapper

## Deployment

Docker multi-stage: Node build → nginx serve. CI/CD via GitHub Actions → GHCR → VPS.
Port: `3002` (app=3000, keeper=3001, web=3002).

## Brand

Follows `nanuqfi-app/docs/brand-guidelines.md`. Dark mode only. Geist Sans/Mono. Sky-500 primary.

## Related Repos

- `nanuqfi/nanuqfi` — Core SDK + Anchor program
- `nanuqfi/nanuqfi-app` — Dashboard app (app.nanuqfi.com)
- `nanuqfi/nanuqfi-keeper` — AI keeper bot (keeper.nanuqfi.com)
```

- [ ] **Step 2: Create README.md**

```markdown
# NanuqFi Marketing Site

Public landing page for [nanuqfi.com](https://nanuqfi.com).

## Development

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build    # outputs to out/
```

## Deploy

Push to `main` triggers GitHub Actions → Docker build → deploy to VPS.

## License

MIT
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: CLAUDE.md and README for nanuqfi-web"
```

---

### Task 16: VPS nginx Config Update

**Files:**
- Modify: VPS nginx config for `nanuqfi.com`

- [ ] **Step 1: SSH into VPS and update nginx**

The VPS currently serves Umami on the `nanuqfi.com` default. Update the nginx config to proxy `nanuqfi.com` to the `nanuqfi-web` container (port 3002).

```bash
# SSH into VPS (via Cloudflare tunnel)
ssh reclabs3
```

Create/update the nginx server block for `nanuqfi.com`:

```nginx
server {
    listen 80;
    server_name nanuqfi.com www.nanuqfi.com;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Note: Cloudflare handles SSL termination (proxy mode), so nginx listens on port 80 only.

- [ ] **Step 2: Test nginx config and reload**

```bash
sudo nginx -t && sudo systemctl reload nginx
```

- [ ] **Step 3: Set up GitHub secrets for the new repo**

In `github.com/nanuqfi/nanuqfi-web` → Settings → Secrets, add:
- `VPS_HOST` — same as other repos
- `VPS_USER` — same as other repos
- `VPS_SSH_KEY` — same as other repos
- `VPS_APP_PATH` — path to docker-compose.yml on VPS (e.g., `/home/nanuqfi/web`)

- [ ] **Step 4: Create app directory on VPS**

```bash
ssh reclabs3 "mkdir -p /home/nanuqfi/web"
```

Copy `docker-compose.yml` to VPS:

```bash
scp docker-compose.yml reclabs3:/home/nanuqfi/web/
```

- [ ] **Step 5: Push to main and verify deploy**

```bash
git push -u origin main
```

Monitor GitHub Actions. Once deploy succeeds, verify `https://nanuqfi.com` serves the marketing site.

---

### Task 17: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
pnpm test
```

Expected: 14 tests pass.

- [ ] **Step 2: Run build**

```bash
pnpm build
```

Expected: Static export succeeds, `out/` directory has `index.html`.

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```

Expected: No errors.

- [ ] **Step 4: Verify live site**

Open `https://nanuqfi.com` in browser:
- [ ] Particle canvas renders and responds to mouse
- [ ] Hero text fades in with staggered animation
- [ ] Counters animate from 0 to target values
- [ ] Both CTA buttons link correctly
- [ ] How It Works section visible on scroll with fade-in
- [ ] Trust Signals metrics count up on scroll
- [ ] GitHub link in trust signals works
- [ ] Footer links all work
- [ ] Page loads fast (<1s FCP)
- [ ] Mobile responsive (check at 375px width)

- [ ] **Step 5: Commit any final fixes and push**

```bash
git push origin main
```
