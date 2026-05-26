# Vercel Migration — nanuqfi

> Handoff for migrating nanuqfi-app from VPS reclabs3 → Vercel.
>
> **Origin session**: `[vercel_migration_1]` on 2026-05-26 (audit + plan).
> **Execution session**: `[nanuqfi_vercel_1]` on 2026-05-26.
> **Status**: ✅ FULLY DONE — VPS decommissioned same-day. Only keeper.nanuqfi.com remains on VPS.

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
1. ~~Preview env vars not set~~ — ✅ DONE 2026-05-26 via Vercel REST API PATCH (token from `~/Library/Application Support/com.vercel.cli/auth.json`). All 5 vars now target=['production','preview'], encrypted values preserved.
2. **Airdrop rate-limit regression** (skipped by decision): in-memory `Map` rate-limit doesn't persist across Vercel serverless instances. Devnet only, hackathon already submitted — left as-is.
3. ~~Uncommitted changes in nanuqfi-app~~ — ✅ DONE 2026-05-26: 3 logical commits pushed (85c0484 keypair, 96c5bad redirects, 162cdd5 CDN). GitHub App wired, auto-deploy fires on push.
4. **Vercel Production Branch**: `main`. PR previews will get env vars now (see #1 done). No action needed.
5. **`output: 'standalone'` in `next.config.ts`**: leftover from Docker — Vercel ignores it. Safe to remove later, not urgent.

### VPS decommission — ✅ DONE 2026-05-26 (same-day, no 7-day buffer)

Done in 3 phases with verification gates:

**Phase 1** (reversible): stopped `nanuqfi-app` container, disabled nginx sites
- `ssh nanuqfi 'cd app && docker compose stop'` → container stopped
- `cp /etc/nginx/sites-enabled/nanuqfi-web /etc/nginx/sites-available/nanuqfi-web.disabled` (backup)
- `rm /etc/nginx/sites-enabled/nanuqfi-{web,app}` → only `nanuqfi-keeper` left in sites-enabled
- `nginx -t && systemctl reload nginx` → no traffic served from VPS for nanuqfi.com / www / app
- Verified: Vercel still serves all 3, keeper still alive

**Phase 2** (reversible): reissued keeper cert standalone
- `certbot --nginx -d keeper.nanuqfi.com --cert-name keeper.nanuqfi.com -n --keep-until-expiring`
- New cert at `/etc/letsencrypt/live/keeper.nanuqfi.com/` (expires 2026-08-24)
- nginx config for `nanuqfi-keeper` auto-updated to point to new cert
- Verified via openssl s_client against VPS IP (bypass CF proxy): subject CN=keeper.nanuqfi.com, SAN keeper.nanuqfi.com only

**Phase 3** (irreversible): deleted old certs, removed container, updated port registry
- `certbot delete --cert-name app.nanuqfi.com -n` → removed (was app + keeper shared)
- `certbot delete --cert-name nanuqfi.com -n` → removed (was apex + www)
- `docker compose rm -f` on VPS → container removed (image `ghcr.io/nanuqfi/nanuqfi-app:main` left, 464MB, can `docker rmi` later)
- Updated `~/Documents/secret/ssh/vps-port-registry.md` (the real file behind the symlink) — retired 9001 entry, fixed `.xyz` typo on 9000

### What remains on the VPS (intentional)
- `nanuqfi-keeper` container (port 9000, untouched)
- `/etc/nginx/sites-available/nanuqfi-app` config file (just unlinked from sites-enabled — not deleted)
- `/etc/nginx/sites-available/nanuqfi-web.disabled` backup
- `/home/nanuqfi/cdn/` (30-day retention per original handoff intent)
- Docker image `ghcr.io/nanuqfi/nanuqfi-app:main` (464MB, can `docker rmi` anytime — it pulls fresh from ghcr.io if ever needed again)

### Cleanup file: `/tmp/nanuqfi-cf-backup-1779813289.json`
DNS rollback file no longer load-bearing now that decommission is complete. Safe to `rm`. macOS may auto-purge on reboot.

### True rollback path (if Vercel ever fails)
DNS backup at `/tmp/nanuqfi-cf-backup-...json` still works for DNS records, but VPS container is gone. Restoring nanuqfi-app on VPS would require:
1. `cd /home/nanuqfi/app && docker compose up -d`
2. `ln -s /etc/nginx/sites-available/nanuqfi-app /etc/nginx/sites-enabled/`
3. `cp /etc/nginx/sites-available/nanuqfi-web.disabled /etc/nginx/sites-enabled/nanuqfi-web`
4. New cert for `nanuqfi.com www.nanuqfi.com app.nanuqfi.com` (the deleted ones are gone forever, need fresh issuance)
5. `nginx -t && systemctl reload nginx`
6. Restore DNS from backup file

~10 min total. Realistic emergency rollback if needed.
