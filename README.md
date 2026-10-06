# GME LIVE WIRE

**Everything that matters to GameStop, before the noise catches up.**

A personal intelligence terminal for GameStop (`$GME`): a Bloomberg/Eikon-style wire narrowed to one company. Every item answers four questions — *what happened, where did it come from, how important is it, and can I open the primary source in one click.*

It is a **polling wire** (refreshes every 60 s), not a tick feed, and not a finance portal: no price predictions, no "AI sentiment", no invented data. The signal score measures **information relevance, not price direction**.

| Module | Source | Needs |
|---|---|---|
| LIVE WIRE | SEC EDGAR + GameStop IR + Google News RSS (+ X) | `SEC_USER_AGENT` |
| INSIDERS / RC TRACKER | Forms 3/4/5 XML, Schedule 13D/G XML, XBRL share counts | `SEC_USER_AGENT` |
| WARRANTS | config terms + your position (+ optional quotes) | `POSITION_JSON` (optional) |
| M&A WATCH | SEC, IR eBay page, news — lanes assigned strictly by source | `SEC_USER_AGENT` |
| TREASURY | SEC XBRL companyfacts | `SEC_USER_AGENT` |
| CAPITAL | `data/capital-structure.json` (curated from filings) | manual curation |
| X WATCH | X API v2 (paid, optional) | `X_BEARER_TOKEN` |

## Local setup

```bash
npm install
cp .env.example .env.local     # edit SEC_USER_AGENT at minimum
npm run dev                    # http://localhost:3000
```

Other commands: `npm run check` (typecheck + lint + tests) · `npm run build` · `npm run smoke` (hits every route of a running server) · `npm run verify:bundle` (no secrets in the client bundle) · `npm run verify:capital`.

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `SEC_USER_AGENT` | **yes** | – | Sent on every SEC request. SEC requires it to identify you, e.g. `GME Live Wire Jane Doe jane@example.com`. Missing ⇒ SEC shows `SETUP REQUIRED`. |
| `X_BEARER_TOKEN` | no | – | Enables X. Missing ⇒ `X API NOT CONNECTED`. **Paid** — see below. |
| `X_HANDLES` | no | `ryancohen,larryvc,gamestop` | Accounts to poll. |
| `X_POLL_SECONDS` | no | `300` (min 60) | Server TTL per handle. |
| `X_INCLUDE_REPLIES` / `X_INCLUDE_REPOSTS` | no | `true` / `false` | Timeline `exclude` flags. |
| `MARKET_DATA_PROVIDER` / `MARKET_DATA_API_KEY` | no | – | `finnhub` supported. Missing ⇒ `MARKET DATA NOT CONNECTED`. |
| `DASHBOARD_PASSWORD` | recommended | – | HTTP Basic Auth on all pages and API routes (any username). **If unset the site is public — and the position panel is then hidden by default (see `ALLOW_PUBLIC_POSITION`); everything else on the site is visible to anyone with the URL.** |
| `POSITION_JSON` | no | – | Your holdings, e.g. `{"shares":{"Broker A":100},"warrants":{"Broker A":10},"warrantDeadlines":{"Broker A":"2026-10-27T17:00"}}`. Deadlines without an offset are read as Brisbane time; `null` = not set. Totals are computed. Put it only in `.env.local` / the host's env settings — never commit it. |
| `ALLOW_PUBLIC_POSITION` | no | `0` | Without `DASHBOARD_PASSWORD` the position panel is **hidden**; set `1` only if you really want holdings visible on a public site. `/api/health` warns when exposed. |
| `MARKET_WARRANT_SYMBOL` | no | guessed | Provider symbol for `GME WS`. If unset, `GME.WS` / `GMEWS` / `GME-WT` are tried and the page flags the symbol as a guess. |
| `WATCH_COUNTERPARTY_TICKERS` | no | `EBAY` | M&A counterparties (resolved via SEC `company_tickers.json`). Add more, comma-separated. |
| `DISPLAY_TIMEZONE` | no | `Australia/Brisbane` | Reserved; the UI shows Brisbane and New York explicitly. |
| `IR_FEED_URL` | no | Q4 candidate | Override the IR press-release JSON endpoint once verified (see limitations). |
| `SEC_ACCEPTANCE_TZ` | no | `auto` | `UTC` \| `America/New_York` \| `auto`. See "SEC timestamps". |

No variable is `NEXT_PUBLIC_`; secrets are only read in server modules (enforced with `server-only`, and `npm run verify:bundle` greps `.next/static`).

## SEC usage and fair access

- Every SEC request carries `SEC_USER_AGENT`, uses gzip, and passes a global limiter of **≤ 5 requests/second** (SEC's ceiling is 10). One retry with backoff on 429/5xx. A **403 is surfaced** with a hint (almost always a missing/invalid User-Agent).
- Filing documents (Form 4 XML, 13D XML, `index.json`, SGML headers) are immutable, so they are cached **by accession number forever**; at most **10 uncached documents are fetched per refresh** (newest first) so cold starts stay fast. The rest fill in over the following refreshes (shown as `DETAILS LOADING`).
- `?force=1` on any API route can only bypass a cache entry older than 30 s (and never an X entry inside its poll interval), so nobody — including a stranger with the URL — can hammer SEC or run up X costs. The UI's refresh button never bypasses server TTLs.

### SEC timestamps
`acceptanceDateTime` carries a `Z` but its real zone has to be verified against an index page's "Accepted" time (Eastern). The app infers the zone from EDGAR's 06:00–22:00 ET acceptance window, honours `SEC_ACCEPTANCE_TZ`, and never shows a future timestamp. **Run `SEC_USER_AGENT="…" node scripts/verify-acceptance.mjs` once from a connected machine** and set `SEC_ACCEPTANCE_TZ` accordingly.

## X setup (optional, costs money)

1. developer.x.com → create a project/app.
2. Generate an app **Bearer Token** → `X_BEARER_TOKEN`.
3. Buy API credits (pay-per-use; there is no free read tier).
4. **Set a monthly spending limit in the developer console.**

Billing is per post returned (**$0.005/post**, user lookups $0.010; the same resource is not charged again within a UTC day). Requests use `max_results=5`, per-handle server caching (`X_POLL_SECONDS`) and 7-day user-ID caching.
Rough cost ≈ `handles × 5 posts × $0.005` per UTC day as baseline (`3 × 5 × $0.005 = $0.075`) + `$0.005` per genuinely new post ⇒ about **US$3–5 / month** at the defaults. Errors are shown with their HTTP status: 429 honours `x-rate-limit-reset`; 401/403 → `token rejected`; credits gone → `X credits exhausted`.

## Architecture

```text
 browser (polls /api/feed every 60s; pauses when the tab is hidden)
    │
    ▼
 proxy.ts ── Basic Auth gate (if DASHBOARD_PASSWORD) ──► app/ pages (server components) + app/api/*
                                                              │
                                  lib/feed.ts  Promise.allSettled, 8 s timeout per request
        ┌───────────────┬───────────────┬──────────────┬───────────────┬──────────────┐
        ▼               ▼               ▼              ▼               ▼              ▼
   sources/sec.ts  sources/ir.ts  sources/news.ts  sources/x.ts   sources/market  sources/xbrl
   (+form4, 13d,   (Q4 JSON feed, (Google News    (X API v2,      (Finnhub)       (companyfacts)
    sgml header)    eBay/warrant   RSS)            credential-
                    pages, 8-K                     gated)
                    fallback)
        └───────────────┴───────┬───────┴──────────────┴───────────────┘
                                ▼
        zod validate → normalize → WireItem → scoring.ts (deterministic) → merge → dedupe.ts → sort
                                ▼
              lib/cache.ts: TTL cache, stale-on-error, in-flight coalescing, immutable-by-accession cache
```

**Caching trade-off.** The in-memory cache is *per serverless instance* (Vercel may run several, and cold starts empty it). To soften this, small upstream responses also go through Next's fetch data cache (`revalidate`) so instances share them; large ones (XBRL `companyfacts`, > 2 MB) cannot, so each cold instance re-fetches them (6 h TTL). No database in this phase.

## Deploy on Vercel

1. Push this repo to GitHub → vercel.com → **Add New… → Project → Import** the repo (framework: Next.js, no overrides).
2. **Settings → Environment Variables**: add `SEC_USER_AGENT`, `DASHBOARD_PASSWORD`, `POSITION_JSON` (and `X_BEARER_TOKEN`, `MARKET_DATA_*` if used) for *Production*.
3. **Deploy.**
4. Open `https://<your-app>.vercel.app/api/health` (log in with any username and your dashboard password): every source should say `live`, X/market `setup` unless configured, and `config` shows which variables are present (booleans only).
5. Function duration: the feed route declares `maxDuration = 30` (fine on Hobby with fluid compute; lower it if your plan caps it).

## Deploy on Render / Railway / any Docker host

```bash
docker build -t gme-live-wire .
docker run -p 3000:3000 \
  -e SEC_USER_AGENT="GME Live Wire you@example.com" \
  -e DASHBOARD_PASSWORD=change-me \
  -e POSITION_JSON='{"shares":{},"warrants":{},"warrantDeadlines":{}}' \
  gme-live-wire
```
On Render/Railway create a *Web Service from a Dockerfile*, add the same variables in the dashboard, and use **`/healthz`** (secret-free, ungated) as the health-check path — `/api/health` sits behind the password gate. The image uses Next's `standalone` output.

## Known limitations

- **Polling, not streaming.** A filing can be up to ~60 s (SEC cache) + 60 s (client poll) old; news 5 min; X `X_POLL_SECONDS`.
- **Per-instance cache** (see above). Parsing is incremental: right after a cold start some filings show `DETAILS LOADING` until later refreshes.
- **Google News links are redirect URLs** (kept as-is, labelled "via Google News"); outlet names come from RSS `<source>`, titles are scored, article text is not read.
- **The IR press-release endpoint may change.** It defaults to the standard Q4 `PressRelease.svc` JSON service with page-script discovery as a fallback; if both fail, IR shows an error and 8-K Ex. 99.1 releases are used instead (`via SEC 8-K`).
- **8-K relevance to M&A** can't be judged from the filing list (titles/descriptions only; full text is not scanned).
- **NYSE holidays** come from a config list (2026); early-close days are not modelled.
- **13D/13G XML parsing** is schema-tolerant but was written without access to real filings (see `docs/DECISIONS.md`); older text/HTML 13Ds are linked, not parsed.
- **Capital structure ships empty** — every figure must be read from filings and sourced (`npm run verify:capital`).
- **Warrant quotes:** providers use different symbols for `GME WS`; the app tries a few spellings and says `WARRANT QUOTE NOT AVAILABLE` if none returns. Check the symbol the provider actually quoted before relying on it.
- **X costs money**; **market data may be delayed**; none of this is investment advice.

## Testing & tooling

`npm run check` runs `tsc --noEmit`, ESLint and Vitest (parsers, scoring traps, dedupe, cache/stale-on-error, health, X, SEC pipeline with the 10-per-cycle budget, forced-failure API tests, password gate, M&A lanes, capital verifier).
**Fixtures in `tests/fixtures/` are SYNTHETIC** (see its README); `npm run capture:fixtures` replaces them with real captures from a connected machine. Extra tools: `scripts/screenshots.mjs`, `scripts/e2e.mjs` (Playwright), `scripts/mock-external.cjs` (verification-only shim that serves fixtures; never part of the app).

## Roadmap

AI filing summaries beside the original (slot reserved in the item model) · persistent store + `since_id` for X · alerts (email/Telegram/Discord/push) · opt-in browser notifications for new HIGH items · COMMUNITY RADAR (Reddit/Superstonk/Stocktwits) as a separate `COMMUNITY / UNVERIFIED` section · full-text scanning of 8-Ks and exhibits · true list virtualisation.
