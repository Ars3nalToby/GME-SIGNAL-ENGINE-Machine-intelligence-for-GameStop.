# CLAUDE.md — GME LIVE WIRE

Project rules for Claude Code. Full brief: `docs/SPEC.md`. Plan: `docs/PLAN.md`. Decisions: `docs/DECISIONS.md`.
Read those first in a new session; keep PLAN.md checklist and DECISIONS.md current.

## 2. Non-negotiables

- **No fabricated data.** No hard-coded posts, filings, headlines, prices or sample items in any production code path. An honest empty state beats a fake one.
- **Provenance on everything.** Every item links to its original source (SEC → filing, IR → investor.gamestop.com, X → original post, News → article).
- **Parse or admit it.** If a value can't be parsed reliably, show the raw filing link and mark it `UNPARSED`. Never guess numbers.
- **Rumour is never fact.** Credibility class is assigned by source type; keywords can never upgrade it.
- **Honest freshness.** This is a polling wire: label it `LIVE WIRE · refreshes every 60s`. Never "real-time" or "tick-by-tick".
- **Honest integrations.** Missing credentials show `X API NOT CONNECTED` / `MARKET DATA NOT CONNECTED`.
- **Secrets stay server-side.** Never use `NEXT_PUBLIC_` for secrets; nothing secret in the client bundle or logs.
- **Graceful degradation.** One failing source never breaks the page; its failure is visible in Source Health.
- **Score ≠ price.** The signal score measures information relevance, not price direction. Say so in the UI.

## 4. Stack (decided)

- **Next.js** (current stable, App Router) + **TypeScript (strict)** + **Tailwind CSS**. Caching and middleware APIs changed across Next 14/15/16 — read the docs for the installed version before implementing caching or the auth gate.
- Route handlers run on the Node.js runtime. `/api/feed` must not be statically prerendered.
- Libraries: `fast-xml-parser` (RSS, Form 4, 13D), `cheerio` (IR HTML), `zod` (validate external payloads and normalized items), `vitest`. A timezone-aware date library. Playwright optional for viewport screenshots. Keep dependencies lean; no UI kit required. Charts: small hand-rolled SVG or one lightweight library.
- Fonts via `next/font`: **Inter** (headlines/body), **IBM Plex Mono** (timestamps, source labels, form types, scores, numbers).
- No database in this phase. Client state in `localStorage`; server cache in memory plus the framework's data cache.
- Deploy: **Vercel** primary. Also `output: "standalone"` + a Dockerfile so Render/Railway work.

## Commands

```bash
npm install
cp .env.example .env.local   # then edit; never commit .env.local
npm run dev                  # http://localhost:3000
npm run typecheck            # tsc --noEmit
npm run lint                 # eslint
npm run test                 # vitest run (fixtures in tests/fixtures — SYNTHETIC, see its README)
npm run check                # typecheck + lint + test
npm run build                # next build (standalone output)
npm run start                # serve the production build
npm run smoke                # curl every API route against a running server (BASE_URL, default :3000)
npm run verify:bundle        # grep .next/static for secret names/values (run after build)
npm run verify:capital       # fails if data/capital-structure.json has an unsourced non-null field
npm run capture:fixtures     # run from a machine with sec.gov access to capture REAL fixtures
```

## Working rules (engineering)

- Next 16: `middleware` is now `proxy.ts` (Node runtime). Route handlers are dynamic by default; keep `export const dynamic = "force-dynamic"` on `/api/*`.
- External payloads → zod → normalize to `WireItem` → score (`lib/scoring.ts`, deterministic) → merge → dedupe.
- Never import from `tests/fixtures` in production code. Fixtures are for tests only.
- Never render source HTML (`dangerouslySetInnerHTML` is banned). Source text is text.
- No `NEXT_PUBLIC_` env vars. Secrets are read only in server modules.
- Hydration safety: no `Date.now()`/`localStorage` during server render; relative times and clocks render after mount.
- Sandbox note: the build sandbox blocks sec.gov / news.google.com / investor.gamestop.com / x.com. Those paths are fixture-tested only; list them as "not verified live".
