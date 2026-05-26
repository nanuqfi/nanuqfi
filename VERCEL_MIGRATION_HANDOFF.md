# Vercel Migration — nanuqfi

> Handoff for migrating nanuqfi-app from VPS reclabs3 → Vercel.
>
> **Origin session**: `[vercel_migration_1]` on 2026-05-26 (audit + plan).
> **Execution session**: `[nanuqfi_vercel_1]` on 2026-05-26.
> **Status**: ✅ CUTOVER COMPLETE — VPS decommission pending 7-day buffer.

## Scope

| # | Project | Local repo | GitHub | Domains | Framework | Status |
|---|---------|-----------|--------|---------|-----------|--------|
| 1 | nanuqfi-app | `~/local-dev/nanuqfi-app` | `nanuqfi/nanuqfi-app` | nanuqfi.com (apex + www + app subdomain) | Next.js (single app, NOT monorepo) | ✅ DONE 2026-05-26 |

**NOT migrating** (stays on VPS):
- `nanuqfi-keeper` (Solana keeper bot — long-lived on-chain agent, not Vercel-fit)

## How to use this file

`cd ~/local-dev/nanuqfi-app`, start a new Claude Code session, paste the **Starter Prompt** below.

---

## Migration #1 — nanuqfi-app

**Target repo to `cd` into**: `~/local-dev/nanuqfi-app`

### Starter Prompt

```
You are continuing a Vercel migration. Today, migrate this repo (nanuqfi-app) from VPS reclabs3 → Vercel.

==========================================================
PROJECT
==========================================================
- Name: nanuqfi-app
- What: Nanuqfi protocol frontend — Next.js app serving multiple domains
- Tech: Next.js (monorepo)
- GitHub: git@github.com:nanuqfi/nanuqfi-app.git

==========================================================
DOMAINS (current routing on VPS — verify before cutover)
==========================================================
The current VPS nginx setup routes MULTIPLE domains to the same Next.js container:

1. nanuqfi.com (apex) + www.nanuqfi.com
   - Currently: nginx site nanuqfi-web proxies to localhost:9001 (same nanuqfi-app container)
   - ALSO serves /cdn/ requests from filesystem alias /home/nanuqfi/cdn (videos, images, PDFs, etc.)

2. app.nanuqfi.com
   - Currently: nginx site nanuqfi-app does a 301 redirect to https://nanuqfi.com/app$request_uri
   - So app.nanuqfi.com → nanuqfi.com/app — single Next.js app handles both

==========================================================
CURRENT VPS STATE (reclabs3)
==========================================================
- Linux user: nanuqfi
- Container: nanuqfi-app (Docker, healthy, 6-week uptime)
- Port: 0.0.0.0:9001 -> container :3000
- nginx configs (TWO):
  - /etc/nginx/sites-enabled/nanuqfi-web (apex + www, proxies + /cdn/ alias)
  - /etc/nginx/sites-enabled/nanuqfi-app (app subdomain, 301 redirect)
- TLS:
  - Cert "nanuqfi.com" covers nanuqfi.com + www.nanuqfi.com (expires ~2026-07-02)
  - Cert "app.nanuqfi.com" covers app.nanuqfi.com + keeper.nanuqfi.com (expires ~2026-08-12)
  - IMPORTANT: keeper.nanuqfi.com is on the same cert as app.nanuqfi.com — DO NOT delete that cert until keeper is also moved (keeper STAYS on VPS, so this cert keeps living on VPS for keeper)
- CDN files: /home/nanuqfi/cdn (mp4, webm, jpg, png, svg, pdf — videos likely)

==========================================================
TARGET VERCEL CONFIG
==========================================================
- Project name: nanuqfi-app
- Framework: Next.js (auto-detect; if monorepo, set Root Directory to apps/web or wherever Next.js lives)
- Build: next build
- Output: .next
- Install: pnpm install
- Env vars: REQUIRED — collect from VPS env (see step 3 below)
- Domains (in Vercel project Settings → Domains):
  - nanuqfi.com (apex) — production
  - www.nanuqfi.com — redirect to apex
  - app.nanuqfi.com — redirect to https://nanuqfi.com/app

==========================================================
EXECUTION STEPS
==========================================================
1) Pre-flight
   $ vercel --version            # ≥ 54.4.1
   $ git status && git pull --rebase
   $ pnpm install && pnpm build  # local Next.js build smoke test

2) Verify monorepo layout
   $ ls -la apps/ packages/ 2>/dev/null
   $ cat package.json | grep -A3 workspaces
   - If Next.js app lives in apps/web (or similar), set Vercel Root Directory accordingly

3) Collect env vars (safely — don't paste secrets into chat)
   $ ssh nanuqfi "docker inspect nanuqfi-app --format '{{range .Config.Env}}{{println .}}{{end}}'" \
       | grep -vE '^_|^PATH|^NODE_|^HOME|^HOSTNAME|^TERM' \
       > /tmp/nanuqfi-app-env-NAMES.txt
   - Review names: DATABASE_URL, NEXT_PUBLIC_*, SOLANA_RPC_URL, etc.
   - Add to Vercel via dashboard (Settings → Environment Variables) — mark secrets as Encrypted

4) Handle CDN assets (/home/nanuqfi/cdn)
   Option A: Move to Vercel Blob (recommended if files are large/many)
   Option B: Move into repo's public/ directory if files are small + stable
   Option C: Keep CDN on VPS, expose via subdomain (cdn.nanuqfi.com) — requires nginx config + new cert
   
   Quick decision: $ ssh nanuqfi "du -sh /home/nanuqfi/cdn && find /home/nanuqfi/cdn -type f | wc -l"
   - If < 100MB total + < 50 files → Option B
   - If > 500MB OR many video files → Option A (Blob)
   
   If Option B (inline):
     $ rsync -avz --progress nanuqfi:/home/nanuqfi/cdn/ ~/local-dev/nanuqfi-app/public/cdn/
     - Update code references from /cdn/foo.mp4 to ensure they still resolve
   
   If Option A (Vercel Blob):
     - Provision Blob storage on Vercel dashboard
     - Upload files via @vercel/blob SDK
     - Update code to use Blob URLs

5) Link + preview
   $ vercel link
   $ vercel
   - Preview URL should render. If env vars missing, expect crashes — add them and redeploy.

6) Production domains
   Vercel → Domains:
   - Add nanuqfi.com (apex)
   - Add www.nanuqfi.com → redirect to nanuqfi.com
   - Add app.nanuqfi.com → redirect to https://nanuqfi.com/app (preserve current behavior)

7) DNS cutover (Cloudflare assumed — verify)
   Lower TTL to 300 for all three records, wait 10 min.
   - nanuqfi.com (apex) → CNAME-flatten to cname.vercel-dns.com (or Vercel A record)
   - www.nanuqfi.com → CNAME → cname.vercel-dns.com
   - app.nanuqfi.com → CNAME → cname.vercel-dns.com
   - On Cloudflare: grey cloud during cutover

8) $ vercel --prod

9) Verify
   $ dig nanuqfi.com +short
   $ dig www.nanuqfi.com +short
   $ dig app.nanuqfi.com +short
   $ curl -sI https://nanuqfi.com
   $ curl -sI https://www.nanuqfi.com | grep -i location   # 301/308 to apex
   $ curl -sI https://app.nanuqfi.com | grep -i location   # 301 to nanuqfi.com/app
   - Test CDN asset paths if moved: https://nanuqfi.com/cdn/<asset>

==========================================================
ROLLBACK
==========================================================
Revert all 3 DNS records → 151.245.137.75. VPS container still running.

==========================================================
VPS DECOMMISSION (AFTER 7-DAY BUFFER)
==========================================================
ssh nanuqfi
  cd ~/<app-dir>; docker compose down (just the nanuqfi-app service; NOT nanuqfi-keeper which stays)
  docker image prune -f
  # KEEP /home/nanuqfi/cdn files for 30 days as backup

ssh reclabs3 (root)
  sudo rm /etc/nginx/sites-enabled/nanuqfi-web
  sudo rm /etc/nginx/sites-available/nanuqfi-web
  sudo rm /etc/nginx/sites-enabled/nanuqfi-app
  sudo rm /etc/nginx/sites-available/nanuqfi-app
  sudo nginx -t && sudo systemctl reload nginx
  sudo certbot delete --cert-name nanuqfi.com
  # DO NOT delete cert "app.nanuqfi.com" — it also covers keeper.nanuqfi.com which stays on VPS
  # Instead, reissue cert for keeper.nanuqfi.com only:
  sudo certbot certonly --nginx -d keeper.nanuqfi.com
  sudo certbot delete --cert-name app.nanuqfi.com   # safe AFTER reissuing for keeper alone

Update ~/.ssh/vps-port-registry.md:
  Remove: "**9001** - nanuqfi-app (Next.js frontend - app.nanuqfi.xyz)"
  Keep: "**9000** - nanuqfi-keeper (REST API - keeper.nanuqfi.xyz)" — keeper stays

==========================================================
GOTCHAS
==========================================================
- The port registry mentions ".xyz" domain but nginx serves ".com" — verify current actual domain (.com per audit)
- TWO nginx sites for nanuqfi (web + app) — both must be removed
- ONE TLS cert shared between app.nanuqfi.com + keeper.nanuqfi.com — handle carefully (reissue keeper-only before deleting shared cert)
- CDN files: large videos = use Vercel Blob, not inline in repo
- nanuqfi-keeper (Solana keeper bot at keeper.nanuqfi.com) STAYS on VPS — do not touch its container or nginx
- If app uses nanuqfi-keeper API (probably yes — frontend → keeper for on-chain data), verify CORS on keeper allows Vercel origin

==========================================================
SUCCESS CRITERIA
==========================================================
[ ] All env vars in Vercel
[ ] CDN strategy decided + implemented (Blob, inline, or separate subdomain)
[ ] All 3 domains resolve to Vercel (apex, www, app)
[ ] www + app subdomain redirects work
[ ] keeper.nanuqfi.com still reachable on VPS (unaffected)
[ ] 7-day buffer → VPS nanuqfi-app container, both nginx configs, shared cert handled
[ ] Mark DONE
```

---

## Shared notes

- **VPS user `nanuqfi`** stays — keeps `nanuqfi-keeper` running
- **DNS provider**: verify before cutover (likely Cloudflare)
- **Audit context**: nanuqfi-app is 1 of 11 total migrations in this round

---

## Execution log — 2026-05-26

**Vercel project**: `rectors-projects/nanuqfi-app` (`prj_fUhTnvc42jWsNvBtFlesrAtW6Iqt`)
**Live deploy**: `nanuqfi-iku413688-rectors-projects.vercel.app` aliased to all 3 domains

### What changed in the app (uncommitted in nanuqfi-app)
- `src/app/api/airdrop/route.ts` — `MINT_AUTHORITY_KEYPAIR` env now accepts inline JSON (starts with `[`) OR filesystem path; backwards-compatible with local dev. 7/7 tests still pass.
- `next.config.ts` — added host-based redirects: `www.nanuqfi.com/:path*` → `nanuqfi.com/:path*`, `app.nanuqfi.com/:path*` → `nanuqfi.com/app/:path*` (permanent 308, path preserved).
- `.env.example` — documented dual-format support for keypair env.
- `public/cdn/` — 13MB of demo assets (videos + poster) inlined from VPS `/home/nanuqfi/cdn` (Option B chosen — small enough, simpler than Blob).

### Env vars on Vercel (Production)
All 5 set, `HELIUS_RPC_URL` + `MINT_AUTHORITY_KEYPAIR` marked sensitive:
- `HELIUS_RPC_URL`, `MINT_AUTHORITY_KEYPAIR` (sensitive)
- `NEXT_PUBLIC_ALLOCATOR_PROGRAM_ID`, `NEXT_PUBLIC_USDC_MINT`, `NEXT_PUBLIC_KEEPER_API_URL=https://keeper.nanuqfi.com`

### Cloudflare DNS changes (zone `78356119a4dc2092a53bd29ed33c4b7e`)
Before: all 3 records A → 151.245.137.75 (VPS), orange-cloud. After:
- `nanuqfi.com` — CNAME → `cname.vercel-dns.com`, grey-cloud (DNS-only)
- `www.nanuqfi.com` — CNAME → `cname.vercel-dns.com`, grey-cloud
- `app.nanuqfi.com` — CNAME → `cname.vercel-dns.com`, grey-cloud
- `keeper.nanuqfi.com` — **unchanged** (A → VPS, orange-cloud)

Backup of pre-cutover DNS state: `/tmp/nanuqfi-cf-backup-1779813289.json`

### Verification (live `nanuqfi.com`)
- 13/13 routes 200 (marketing + app + dynamic [riskLevel] + robots/sitemap)
- CDN: `/cdn/videos/demo.mp4` 200 (13.5MB), `/cdn/images/demo-poster.jpg` 200 (48KB)
- `/api/rpc`: 200, getHealth returns "ok" (HELIUS_RPC_URL wired correctly)
- `/api/airdrop`: 200, real devnet mint sig `rDNJySfxEauYMT9z7TcM4ryvVqBpHhaqwyBcBg6hLaGMCayRs2EYMFsa5EpqrhF5aqPgPEbjXQHDKH35CsQxT6u` (MINT_AUTHORITY_KEYPAIR works)
- `www.nanuqfi.com/strategy` → 308 → `nanuqfi.com/strategy` ✓
- `app.nanuqfi.com/vaults` → 308 → `nanuqfi.com/app/vaults` ✓
- `keeper.nanuqfi.com` — still served via CF→VPS (server: cloudflare)

### Known issues / follow-ups (non-blocking)
1. **Preview env vars not set**: Vercel CLI v54.4.1 has a bug — its own documented `--value --yes` syntax for "all preview branches" still returns `git_branch_required`. **Action**: add the 5 env vars to Preview env via dashboard: https://vercel.com/rectors-projects/nanuqfi-app/settings/environment-variables
2. **Airdrop rate-limit regression**: in-memory `Map` rate-limit doesn't persist across Vercel serverless instances. Two airdrops 10s apart to same wallet both succeeded on prod. Devnet only, low risk for hackathon demo. **Action (optional)**: migrate to Vercel KV / Upstash Redis if user-facing abuse becomes a concern.
3. **Uncommitted changes in nanuqfi-app**: 3 modified files + `public/cdn/` not yet committed/pushed. **Action**: review diff + commit + push (auto-deploys via the Vercel GitHub App once committed).
4. **Vercel Production Branch**: defaulted to `main`. PRs to other branches will deploy as preview — no env vars set yet (see #1).
5. **`output: 'standalone'` in `next.config.ts`**: leftover from Docker — Vercel ignores it. Safe to remove later, not urgent.

### Pending — 7-day buffer (decommission target ~2026-06-02)
- `ssh nanuqfi` → `docker compose down` (nanuqfi-app service only, keeper stays)
- `docker image prune -f`
- Keep `/home/nanuqfi/cdn` for 30 days as backup
- `ssh reclabs3` → remove both nginx sites for nanuqfi (web + app), reload nginx
- TLS: reissue `keeper.nanuqfi.com` standalone cert (currently shares cert with app.nanuqfi.com), THEN `certbot delete --cert-name app.nanuqfi.com` and `certbot delete --cert-name nanuqfi.com`
- Update `~/.ssh/vps-port-registry.md`: remove 9001 (nanuqfi-app), keep 9000 (nanuqfi-keeper)

### Rollback (if needed within buffer)
1. Restore CF DNS from `/tmp/nanuqfi-cf-backup-1779813289.json` — change all 3 back to A → 151.245.137.75, orange-cloud
2. VPS container still running, traffic auto-restores within a few minutes
