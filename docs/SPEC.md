# GME LIVE WIRE — Build Brief for Claude Code

> Tagline: **Everything that matters to GameStop, before the noise catches up.**

## 0. How you should work

You are the lead engineer and owner of this project. Build a working, deployable application — not a mock-up, not instructions for me.

1. **Persist the brief.** First action: save this entire brief verbatim to `docs/SPEC.md`. Then create `CLAUDE.md` containing §2 (Non-negotiables), §4 (Stack) and the project's dev/test/build commands, so the rules survive context compaction and future sessions.
2. **Inspect before planning.** If a prototype exists in the working directory (`server.mjs`, `public/index.html`, `public/app.js`, `public/styles.css`, Dockerfile, Render config), read it first. Reuse what is sound (scoring ideas, design tokens, parsing logic); do not preserve weak architecture. Move old files into `legacy/` rather than deleting them.
3. **Plan, then go.** Write `docs/PLAN.md` with the milestones in §15 as a checklist and keep it updated. Then start building immediately — do not wait for my approval.
4. **Probe before you code.** For every external source, make a real request first (shell or your web tools), inspect the actual response, then write the parser against what you saw. Save trimmed real responses under `tests/fixtures/` — for tests only, never as UI fallback data.
5. **Decide, don't ask.** Make sensible decisions yourself and log each non-obvious one in `docs/DECISIONS.md` (one line: decision + reason). Only stop to ask me when you need a credential, or a decision that costs money or can't be undone.
6. **Commit per milestone** with a clear message.
7. **Prove it works.** Before calling any milestone done: type-check, lint, unit tests, production build, and a smoke test of every API route. Fix everything they report.
8. **Be honest about your environment.** If your sandbox blocks a source (e.g. sec.gov or news.google.com), say so, still build and fixture-test that code path, and list it as "not verified live" in your report. Never fill a gap with invented data.

## 1. Product

Today is **6 October 2026**. The owner is a long-term GME shareholder in **Brisbane, Australia (AEST, UTC+10, no daylight saving)**. US corporate events happen on New York time.

GME LIVE WIRE is a personal intelligence terminal for GameStop ($GME) — a Bloomberg/Eikon-style wire narrowed to one company. For every item it must answer:

1. What actually happened?
2. Where did it come from?
3. How important is it?
4. Can I open the primary source in one click?

It is **not** a finance portal: no widget walls, meme styling, rocket emojis, price predictions or "AI sentiment".

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

## 3. Verified anchors (checked 6 Oct 2026 — re-verify during build)

Use these for config and tests. Do not render them as hard-coded content; the UI shows what the sources return.

- GameStop SEC CIK: `0001326380`.
- eBay SEC CIK: `0001065088` — still resolve tickers via `https://www.sec.gov/files/company_tickers.json` rather than trusting this blindly.
- **GME warrants** (10-K for fiscal year ended 31 Jan 2026, later 10-Qs, IR release 7 Oct 2025): cash exercise price **$32.00**, one share per warrant **subject to anti-dilution adjustment** (the company may also voluntarily lower the strike or raise the exercise rate); expire **5:00 pm New York City time on 30 Oct 2026**; trade on NYSE as **`GME WS`**. The 10-K reports 59,088,333 warrants outstanding at 31 Jan 2026 — useful as a parser sanity check.
- **eBay:** GameStop publicly proposed to acquire eBay (IR release dated 3 May 2026) and has filed a Schedule 13D and amendments on eBay. GameStop's IR site has a server-rendered page listing the related releases, documents and filings: `https://investor.gamestop.com/eBay/default.aspx`. Do not seed the deal's status from this brief — reconstruct it from sources.
- Schedules 13D/13G are now filed as structured XML; EDGAR form types appear as `SCHEDULE 13D`, `SCHEDULE 13D/A`, `SCHEDULE 13G`, `SCHEDULE 13G/A` (older filings: `SC 13D`, `SC 13D/A`, `SC 13G`, `SC 13G/A`). Match both families.
- For XML forms, `primaryDocument` often points to an XSL-rendered view (e.g. `xslF345X05/…xml`, `xslSCHEDULE_13D_X02/primary_doc.xml`). The raw XML is the same file without the `xsl…/` directory prefix.
- Real 13D/A fixtures to study: GameStop-as-filer re eBay — `https://www.sec.gov/Archives/edgar/data/1326380/000119312526260340/primary_doc.xml`; Ryan Cohen re GameStop — `https://www.sec.gov/Archives/edgar/data/1326380/000092189526000062/primary_doc.xml`.
- Ryan Cohen's 13D/A filings disclose warrants and a large performance-based stock option award (Jan 2026). SEC beneficial ownership can include securities acquirable within 60 days, so **shares owned** and **beneficial ownership %** are different numbers.
- **X API** (docs.x.com pricing page): pay-per-use, no free read tier; post reads **$0.005 per post returned**, user reads $0.010; the same resource is not charged again within a 24-hour UTC window.

## 4. Stack (decided)

- **Next.js** (current stable, App Router) + **TypeScript (strict)** + **Tailwind CSS**. Caching and middleware APIs changed across Next 14/15/16 — read the docs for the installed version before implementing caching or the auth gate.
- Route handlers run on the Node.js runtime. `/api/feed` must not be statically prerendered.
- Libraries: `fast-xml-parser` (RSS, Form 4, 13D), `cheerio` (IR HTML), `zod` (validate external payloads and normalized items), `vitest`. A timezone-aware date library. Playwright optional for viewport screenshots. Keep dependencies lean; no UI kit required. Charts: small hand-rolled SVG or one lightweight library.
- Fonts via `next/font`: **Inter** (headlines/body), **IBM Plex Mono** (timestamps, source labels, form types, scores, numbers).
- No database in this phase. Client state in `localStorage`; server cache in memory plus the framework's data cache.
- Deploy: **Vercel** primary. Also `output: "standalone"` + a Dockerfile so Render/Railway work.

## 5. Architecture

```text
gme-live-wire/
├─ app/
│  ├─ page.tsx                 LIVE WIRE
│  ├─ insiders/page.tsx  rc/page.tsx  warrants/page.tsx
│  ├─ ma/page.tsx  capital/page.tsx  treasury/page.tsx
│  └─ api/ feed · sec · ir · x · news · insiders · fundamentals · health  (route.ts each)
├─ components/
├─ lib/
│  ├─ sources/ sec.ts · sec-form4.ts · sec-13d.ts · xbrl.ts · ir.ts · x.ts · news.ts · market.ts
│  ├─ scoring.ts · normalize.ts · dedupe.ts · cache.ts · http.ts · time.ts
│  └─ config/ watch.ts (CIKs, handles, keywords) · publishers.ts · position.ts
├─ data/capital-structure.json
├─ tests/ (fixtures/)
├─ docs/ SPEC.md · PLAN.md · DECISIONS.md
├─ CLAUDE.md · README.md · .env.example · Dockerfile
```

**Data flow:** each source independently → fetch with timeout → validate (zod) → normalize to `WireItem` → score → merge → dedupe/cluster → sort by `publishedAt` desc → `/api/feed` returns `{ items, sources, generatedAt }`.

**Reliability rules**
- `Promise.allSettled` across sources; 8-second timeout per request via `AbortController`.
- `lib/cache.ts`: TTL cache with **stale-on-error** — if a refresh fails and a previous good result exists, serve it and mark the source `degraded` with its age. Coalesce concurrent in-flight requests for the same key.
- TTLs: SEC submissions 60s · individual filing documents (Form 4 XML, 13D XML, index.json) **cached indefinitely by accession number** (filings are immutable) · XBRL 6h · IR 5 min · News 5 min · X = `X_POLL_SECONDS` (default 300).
- In-memory cache is per serverless instance; also use the framework's fetch/data cache so Vercel instances share it. Document the trade-off in README.
- `lib/http.ts` SEC client: `User-Agent` from `SEC_USER_AGENT` on every request; gzip; global limiter ≤ 5 req/s (SEC's fair-access ceiling is 10); one retry with backoff on 429/5xx; a 403 is surfaced clearly (usually a missing/invalid User-Agent). Missing `SEC_USER_AGENT` → SEC status `setup`.
- Parse at most 10 uncached filing documents per refresh cycle (newest first) so cold starts stay inside serverless time limits; the rest fill in on later cycles.
- The manual refresh button re-fetches `/api/feed`; it must **not** bypass server TTLs. `?force=1` may only bypass caches older than 30 seconds, so nobody (including a stranger with the URL) can hammer SEC or run up X costs.
- Client polls `/api/feed` every 60s, pauses while the tab is hidden, and refreshes immediately when it becomes visible.

**Source health**
```ts
type SourceHealth = {
  id: "sec" | "ir" | "x" | "news" | "market"
  label: string
  status: "live" | "degraded" | "setup" | "error"
  lastSuccessAt?: string
  lastAttemptAt?: string
  lastError?: string      // short, includes HTTP status
  itemCount: number
  latencyMs?: number
  note?: string
}
```
Colours: live = green · degraded = amber `STALE 7m` · setup = amber `SETUP REQUIRED` · error = red.

## 6. Unified item schema

```ts
type WireItem = {
  id: string                 // stable: sec:<accession> | ir:<hash(url)> | x:<postId> | news:<hash(normalizedTitle)>
  sourceType: "sec" | "ir" | "x" | "news"
  source: string             // "SEC EDGAR" | "GameStop IR" | "X · @ryancohen" | "Reuters · via Google News"
  credibility: "primary_filing" | "official_company" | "insider_direct" | "reporting_tier1" | "reporting" | "opinion"
  title: string
  summary?: string
  publishedAt: string        // ISO UTC
  fetchedAt: string
  url: string                // primary source
  altLinks?: { label: string; url: string }[]   // filing index, raw XML, Ex. 99.1, other outlets
  author?: string
  handle?: string
  form?: string
  formLabel?: string
  items8k?: string[]
  accessionNumber?: string
  filer?: { name: string; cik: string }
  subject?: { name: string; cik: string }
  people: ("ryan_cohen" | "larry_cheng")[]
  tags: string[]
  score: number              // 0–99, information relevance
  signal: "high" | "medium" | "low"
  scoreReasons: string[]     // shown on hover/tap
  insiderTxns?: InsiderTxn[]
  cluster?: { count: number; outlets: string[] }
}
```

## 7. Sources

### 7.1 SEC EDGAR (highest authority)
- Poll `https://data.sec.gov/submissions/CIK0001326380.json`. Use `filings.recent` (`accessionNumber`, `form`, `filingDate`, `acceptanceDateTime`, `items`, `primaryDocument`, `primaryDocDescription`, `reportDate`).
- Also poll each watched counterparty (default eBay) and keep only M&A-relevant forms: `8-K`, 13D family, `SC TO-T`, `SC TO-C`, `SC 14D9`, `425`, `DEFC14A`, `PREC14A`, `DFAN14A`, `DEFA14A`.
- Links: document `https://www.sec.gov/Archives/edgar/data/<cik without leading zeros>/<accession without dashes>/<primaryDocument>`; index page `…/<accession>-index.htm`; folder listing `…/index.json` (use it to locate raw XML and 8-K Exhibit 99.1).
- **Timestamps:** verify which timezone `acceptanceDateTime` actually represents by comparing several against the "Accepted" time on their index pages (Eastern time). Normalize correctly to UTC and record the finding in DECISIONS.md.
- **Subject vs filer:** a 13D/13G/425/SC TO in GameStop's list may be about GameStop or filed *by* GameStop about another company. Determine filer and subject (filing index/header or 13D XML) before titling or scoring. Titles must be unambiguous, e.g. `SCHEDULE 13D/A — GameStop's stake in eBay Inc.` vs `SCHEDULE 13D/A — Ryan Cohen's stake in GameStop`.
- **8-K items** → readable titles and scoring: 1.01 Material definitive agreement · 1.02 Termination of material agreement · 2.01 Completion of acquisition/disposition · 2.02 Results of operations (earnings) · 2.03 Direct financial obligation (debt/convertibles) · 3.02 Unregistered equity sales · 3.03 Material modification of holders' rights · 5.01 Change in control · 5.02 Director/officer changes · 5.03 Charter/bylaw amendments · 5.07 Shareholder vote results · 7.01 Reg FD disclosure · 8.01 Other events · 9.01 Exhibits. Example title: `8-K · 2.02 Results of Operations · 9.01 Exhibits`. Attach Exhibit 99.1 as alt link "Press release (Ex. 99.1)".
- **Form labels:** 3 Initial insider ownership · 4 Insider transaction · 5 Annual insider statement · 144 Proposed insider sale · 10-Q / 10-K · DEF 14A Proxy statement · S-3/S-3ASR Shelf registration · 424B* Prospectus · S-4 Business-combination registration · S-8 Employee plan registration · SC TO-T Third-party tender offer · SC 14D9 Target response to tender offer · 425 Business-combination communication · 8-A12B Exchange listing · 25-NSE Exchange delisting · CORRESP/UPLOAD SEC correspondence.

### 7.2 Form 3/4/5 insider parser
- Parse the latest 60 Forms 3/4/5 where GameStop is issuer (incrementally, per §5); cache each forever by accession.
- Raw XML: strip the XSL prefix from `primaryDocument`, or find the `.xml` via `index.json`.
- Ownership XML: `ownershipDocument` → `reportingOwner[]` (`reportingOwnerId/rptOwnerName`, `rptOwnerCik`; `reportingOwnerRelationship`: `isDirector`, `isOfficer`, `officerTitle`, `isTenPercentOwner`) → `nonDerivativeTable/nonDerivativeTransaction[]` and `derivativeTable/derivativeTransaction[]` (`securityTitle`, `transactionDate`, `transactionCoding/transactionCode`, `transactionAmounts/transactionShares`, `transactionPricePerShare`, `transactionAcquiredDisposedCode`, `postTransactionAmounts/sharesOwnedFollowingTransaction`, `ownershipNature/directOrIndirectOwnership`, `natureOfOwnership`) → `footnotes`. Values sit in `.value` children; footnote references can replace or qualify values. Confirm all of this against real fixtures.
- Transaction codes → labels: P open-market/private purchase · S sale · A grant/award · D disposition to issuer · F tax/exercise-price withholding · M exercise/conversion (exempt) · X exercise of in/at-the-money derivative · C conversion · G gift · J other.

```ts
type InsiderTxn = {
  ownerName: string
  ownerCik: string
  roles: string[]
  officerTitle?: string
  securityTitle: string
  isDerivative: boolean
  code: string
  codeLabel: string
  acquiredDisposed: "A" | "D"
  date: string
  shares: number | null
  pricePerShare: number | null
  priceNote?: string          // e.g. weighted-average footnote text
  value: number | null        // shares × price, only when both are exact
  sharesOwnedAfter: number | null
  directIndirect: "D" | "I"
  natureOfOwnership?: string
  accessionNumber: string
  filingUrl: string
  parseStatus: "ok" | "partial" | "failed"
}
```

- Multiple owners and multiple rows per filing are normal. Never sum direct + indirect holdings unless every row parsed; label each.
- Weighted-average prices: show the footnote text and mark price `avg — see footnote`.
- **Title classification:**
  - Purchase (code P): `FORM 4 · Ryan Cohen · PURCHASE 500,000 sh @ $XX.XX` — values only if parsed.
  - Warrant exercise (derivative row on the warrants, code X or M): its own class `WARRANT EXERCISE` — never call it a purchase. Warrants expire 30 Oct 2026, so expect these this month.
  - Routine (only A/F/G/D): `FORM 4 · <name> · routine (grant / tax withholding)`.
  - Unparsed: `FORM 4 · <name> (unparsed — open filing)`.

### 7.3 Schedule 13D/13G parser
- Structured XML format: extract reporting persons, aggregate amount beneficially owned, percent of class, event date, filer and subject. Learn element names from the two §3 fixtures — don't guess.
- Older text/HTML 13Ds: link only, don't parse.

### 7.4 XBRL fundamentals (`/api/fundamentals`)
- `https://data.sec.gov/api/xbrl/companyfacts/CIK0001326380.json` and `https://data.sec.gov/api/xbrl/companyconcept/CIK0001326380/<taxonomy>/<tag>.json`.
- Shares outstanding: `dei:EntityCommonStockSharesOutstanding` with its as-of date.
- Cash, marketable securities / short-term investments, debt and convertible notes, and any crypto/Bitcoin-related values: **discover which tags GameStop actually uses** in companyfacts. Each number carries tag name, period end, form, filed date and accession link. If absent: `not tagged in XBRL — see filing`.

### 7.5 GameStop Investor Relations
- The news-releases page (`/news-releases/default.aspx`) renders its list with JavaScript; the HTML contains no items, and `/rss/news-releases.xml` returns 404. The site appears to be Q4-hosted; such sites typically load releases from a JSON feed service. Find the real endpoint in the page's scripts, verify it with a request, and use it. No headless-browser scraping.
- Also ingest these server-rendered pages (5-min TTL): `https://investor.gamestop.com/eBay/default.aspx` (news, documents, SEC filings → M&A WATCH) and `https://investor.gamestop.com/warrant-dividend/default.aspx` (→ WARRANTS). Check `https://investor.gamestop.com/newsroom` too.
- Fallback if the IR feed fails: 8-K Exhibit 99.1 press releases from SEC, labelled `via SEC 8-K`.
- Extract text only. Never render source HTML (`dangerouslySetInnerHTML` is banned for source content).

### 7.6 X (optional, credential-gated, paid)
- Env: `X_BEARER_TOKEN`, `X_HANDLES` (default `ryancohen,larryvc,gamestop`), `X_POLL_SECONDS` (default 300), `X_INCLUDE_REPLIES` (default true), `X_INCLUDE_REPOSTS` (default false).
- No token → X status `setup`; feed omits X; sidebar X WATCH shows `X API NOT CONNECTED` with profile links. Never placeholder posts.
- Flow: resolve IDs once via `GET /2/users/by?usernames=…` (cache 7 days) → `GET /2/users/:id/tweets?max_results=5&tweet.fields=created_at,referenced_tweets,entities` (+ `exclude=` per config).
- **Cost control:** billing is per post returned; re-reading the same post within a UTC day is not charged again. Keep `max_results=5` and the server TTL. Put the cost formula in README (≈ handles × 5 posts × $0.005 per UTC day baseline + $0.005 per new post). Estimated US$3–5/month at defaults.
- Errors: 429 → respect `x-rate-limit-reset`; 401/403 → `error: token rejected`; credit exhaustion → `error: X credits exhausted`. Always show the HTTP status in health.
- Item URL `https://x.com/<handle>/status/<id>`. Initials badges RC / LC / GS — no profile photos.
- Later optimisation (not now): `since_id` with a persistent store.

### 7.7 News
- Google News RSS: `https://news.google.com/rss/search?q=<query>&hl=en-US&gl=US&ceid=US:en`. Use 3–4 OR-combined queries covering: GameStop/GME · Ryan Cohen · Larry Cheng · GameStop + eBay/acquisition/tender · GameStop + convertible/warrants/offering/Bitcoin/insider/Form 4.
- Titles end in ` - Publisher`: strip it and use the `<source>` element as publisher. Links are Google redirect URLs: keep them and label `via Google News`. Don't decode them with undocumented tricks.
- Drop items whose title/description doesn't mention GameStop, GME, Ryan Cohen or Larry Cheng.
- Publisher tiers in `lib/config/publishers.ts` (editable): **T1** Reuters, Bloomberg, WSJ, Financial Times, AP, CNBC, Barron's · **T2** NYT, Axios, Fortune, MarketWatch, Business Wire, PR Newswire, GlobeNewswire · **T3** Yahoo Finance, Business Insider, Benzinga, TheStreet, Investing.com · **Opinion** Motley Fool, Seeking Alpha, InvestorPlace, Zacks, 24/7 Wall St · unknown = T3.

### 7.8 Market data (optional module)
- Adapter `MarketDataProvider { quote(symbol): Promise<Quote> }` with one legitimate provider behind `MARKET_DATA_PROVIDER` + `MARKET_DATA_API_KEY` (Finnhub is a reasonable default — check its current terms). Show provider name and delay.
- No key → `MARKET DATA NOT CONNECTED` wherever a price would appear. No portfolio value, no ITM/OTM label, no scraping.
- If the provider can't quote `GME WS` → `WARRANT QUOTE NOT AVAILABLE`.

## 8. Signal scoring (deterministic, explainable, tested)

Score 0–99. **HIGH ≥ 85** (red) · **MED 60–84** (amber) · **LOW < 60** (blue-grey). Every item carries `scoreReasons` (e.g. `Form 4 · Ryan Cohen · code P → 98`), shown on hover/tap. Recency never changes the score: the feed sorts by time; the score says how much it matters.

**SEC base scores** (8-K with several items takes the max)

| Form | Score |
|---|---|
| Form 4 — Ryan Cohen, code P | 98 |
| Form 4 — Ryan Cohen warrant exercise | 95 |
| Form 4 — any insider, code P | 92 |
| Form 4 — Ryan Cohen, other | 88 |
| Form 4 — any insider, code S | 82 |
| Form 4 — unparsed | 80 |
| Form 4 — Larry Cheng, other | 78 |
| Form 4 — M/X (others) | 72 |
| Form 4 — routine only (A/F/G/D) | 62 |
| 8-K items 1.01, 1.02, 2.01, 2.03, 3.02, 3.03, 5.01 | 95 |
| 8-K item 2.02 | 92 |
| 8-K item 5.02 | 88 |
| 8-K items 7.01, 8.01 | 82 |
| 8-K other | 76 |
| SC TO-T, SC TO-I, SC TO-C, SC 14D9, 425, S-4 | 95 |
| 13D family (96 if filer is Ryan Cohen or subject is a watched counterparty) | 92 |
| DEFC14A, PREC14A, DFAN14A | 90 |
| 10-K, 10-Q (amendments 72) | 88 |
| S-3, S-3ASR, 424B* (92 if it mentions notes, offering or warrants) | 86 |
| DEF 14A, PRE 14A | 78 |
| 8-A12B, 25-NSE | 75 |
| 144, DEFA14A | 70 |
| 13G family | 62 |
| Form 3, Form 5 | 60 |
| S-8 | 58 |
| CORRESP, UPLOAD | 55 |
| Other | 50 |

**Other sources**

| Source | Base | Cap |
|---|---|---|
| GameStop IR release | 86 | 98 |
| X @ryancohen original post | 86 | 99 |
| X @ryancohen reply | 78 | 95 |
| X @larryvc | 66 | 84 |
| X @gamestop | 52 | 80 |
| News T1 | 50 | 88 |
| News T2 | 44 | 80 |
| News T3 / unknown | 36 | 74 |
| News opinion | 24 | 49 |

**Keyword boosts** (case-insensitive word-boundary regex; each group counts once; total boost capped at +20):
- M&A +10: acquire/acquires/acquired/acquisition, merger, tender offer, business combination, takeover, eBay
- Capital +8: convertible, capital raise, at-the-market, `ATM` (uppercase only), dilution, (equity|stock|share|note|debt) offering, shelf registration, prospectus
- Warrants +8: `warrant`, `warrants` — never `warranty` / `warranties`
- Insider +8: Form 4, 13D, insider (purchase|buy|buys|buying|bought|sale|sells|selling), beneficial owner
- Treasury +6: bitcoin, `BTC` (uppercase), treasury, buyback, repurchase
- Results +6: earnings, quarterly results, preliminary results, guidance
- People +5: Ryan Cohen, Larry Cheng · +3: CEO, chief executive, board of directors
- T1/T2 news only, +15: "exclusive", "sources said" or "people familiar" combined with an M&A hit

**Penalties** (news only, −12): should you buy, better buy, too late to buy, millionaire, prediction, "N reasons", stock to buy.

**Required scoring tests include:** "extended warranty" ≠ warrant; "board games" / "keyboard" ≠ board; "product offering" gets no Capital boost; "atmosphere" ≠ ATM; RC Form 4 code P → HIGH 98; routine code-F Form 4 → 62; T3 eBay rumour ≤ 74; T1 exclusive on an acquisition → HIGH; RC original post → HIGH.

## 9. Dedupe & clustering
- Normalize titles: lowercase, strip publisher suffix and punctuation, collapse whitespace.
- Exact key: URL, or normalized title + day.
- Near-duplicates: token-set Jaccard ≥ 0.75 within 48h → one cluster. Representative = highest score, then higher tier, then earliest. Show `+N outlets` (expandable).
- Cross-source: a news item matching an IR release (Jaccard ≥ 0.8 within 24h) folds into the IR item as `Also reported by …`; IR release ↔ 8-K Ex. 99.1 likewise.

## 10. Interface

**Design language:** Bloomberg/Eikon dark terminal — institutional, slightly cyber, never meme-casino.
Tokens: background `#090b10` · panels `#0f1219` · borders `#252b39` · text `#f5f7fb` · muted `#8992a6` · GameStop red / HIGH `#e52436` · live green `#3ee08f` · amber `#ffbf5b` · blue `#5aa7ff`. Monospace for timestamps, source labels, form types, scores, numbers; Inter for headlines.

**Header:** `GME LIVE WIRE` · subtitle `GameStop Intelligence Terminal` · status pill `● LIVE WIRE` (green; amber if any source degraded/setup; red if `/api/feed` itself fails) · Brisbane clock · New York clock · NYSE session label (Pre-market 04:00–09:30 ET · Open 09:30–16:00 · After-hours 16:00–20:00 · Closed; weekends handled; holidays only if listed in config — say so) · `Updated 12:45:22 · next 38s` · refresh button that spins while loading (respect `prefers-reduced-motion`).

**Hero line:** `EVERYTHING THAT CAN MOVE $GME`.

**Stat cards:** WIRE ITEMS · HIGH SIGNAL · LATEST SEC (form + age, e.g. `4 · 32m ago`) · SOURCES LIVE (`3/4`).

**Nav:** LIVE WIRE · INSIDERS · RC TRACKER · WARRANTS · M&A WATCH · CAPITAL · TREASURY — show only pages that are built; no "coming soon" clutter.

**Filters:** ALL · SEC · GAMESTOP IR · RYAN / LARRY (their X posts **and** their SEC filings) · NEWS · ★ SAVED, plus a `HIGH only` toggle.

**Search:** full-text over title, summary, source, form, tags, author. Placeholder `Search eBay, warrant, Form 4…`. Watch-word chips (default: eBay, Form 4, convertible, warrant, acquisition, Bitcoin, offering, buyback) fill the search; user can add/remove chips (persisted).

**Item card:**
```text
SEC EDGAR · 18m ago · 06 Oct 10:42 AEST           FORM 4        HIGH 98
Form 4 — Ryan Cohen · PURCHASE 500,000 sh @ $XX.XX
Insider transaction filed with the SEC.
[SEC] [Form 4] [Ryan Cohen]                ☆ SAVE   FILING INDEX   OPEN ↗
```
The score badge opens `scoreReasons`. RC items get a red left rule + `RC` badge; LC items an amber rule + `LC` badge. Clusters show `+N outlets`.

**Timeline view** (toggle Cards / Timeline): dense monospace rows `HH:MM  SOURCE  FORM/TYPE  title  SCORE`, grouped Today / Yesterday / date. Times in Brisbane; hover shows ET.

**RC alert card:** pinned at the top of LIVE WIRE when a Ryan Cohen Form 4 with code P, or a warrant exercise, was filed in the last 7 days. Only parsed values: shares, average price, total cost, holdings after, filed age, `VIEW FORM 4 →`. Marked `NEW` if filed after the stored `lastSeenAt`.

**Sidebar (desktop ≈ 27% width, feed ≈ 73%):** SOURCE HEALTH · MY POSITION + warrant countdown · WATCH WORDS · X WATCH (RC / LC / GS: status, last post time, profile link) · SIGNAL KEY (HIGH/MED/LOW definitions + "Score = how much this matters for understanding GameStop. Not a price prediction or trade signal.").

**Mobile (≤ 768px):** stat cards 2-column; filters wrap or scroll horizontally; search sticky under the header; sidebar sections stack below the feed in the order above; readable at 360px; tap targets ≥ 44px.

**States:** every panel has a designed empty state and error state (e.g. `SEC unavailable — showing data from 12m ago`). Announce new HIGH items via `aria-live="polite"`. Never rely on colour alone.

**Hydration safety:** clocks and relative times render client-side after mount; the server renders absolute `<time dateTime>`. No `Date.now()` or `localStorage` during server render.

**Persisted locally:** saved items (store a full snapshot so they survive leaving the feed), active filter, watch words, view mode, `lastSeenAt`. Wrap all storage access in try/catch.

## 11. Modules

### 11.1 My Position
- Read from server env `POSITION_JSON` — never committed to the repo. My real values (put them only in `.env.local` and the Vercel dashboard):
  `{"shares":{"Computershare":<REDACTED>,"CommSec":<REDACTED>},"warrants":{"Computershare":<REDACTED>,"CommSec":<REDACTED>},"warrantDeadlines":{"Computershare":null,"CommSec":null}}` _(values redacted in the committed copy per §11.1/§12; the verbatim brief is in the gitignored `docs/SPEC.local.md`)_
- Show per-venue rows and computed totals (totals computed, not typed in).
- No portfolio value unless market data is connected.

### 11.2 Warrants (`/warrants` + sidebar countdown)
- Expiry instant: `2026-10-30 17:00` in `America/New_York` — compute with a timezone-aware library, never `new Date("2026-10-30")`. Display both `30 OCT 5:00 PM ET` and `SAT 31 OCT 7:00 AM BRISBANE`. Countdown in days (e.g. `24 DAYS TO WARRANT EXPIRY`), h:m under 48h, `EXPIRED` after.
- Broker/agent cut-offs from `warrantDeadlines`; if null show `CUT-OFF NOT SET — confirm with CommSec / Computershare` (instruction deadlines are usually earlier than legal expiry).
- Mechanics without market data: exercise cash = warrants × exercise price, per venue and total; shares received = warrants × exercise rate.
- With market data: intrinsic value per warrant = max(0, GME − exercise price) and total; if a `GME WS` quote exists, time value = warrant price − intrinsic. Facts only — no "you should".
- Terms note: exercise price/rate come from config, with a "terms may be adjusted" note linking to the IR warrant-dividend page; flag any new filing whose text mentions warrant adjustment.
- Related items: warrant-tagged filings/releases, the IR warrant-dividend page, `25-NSE` / `8-A12B` filings.

### 11.3 Insiders (`/insiders`, `/api/insiders`)
- Table: insider · role · code label · date · shares · price · value · holdings after (D/I) · filing link. Filters: All / Purchases only / Ryan Cohen / Larry Cheng. Unparsed rows show `UNPARSED — open filing`.
- Ryan Cohen purchase history: chronological list of every parsed code-P transaction.

### 11.4 RC Tracker (`/rc`)
- Two clearly separate series:
  1. **Shares owned** (Form 4 `sharesOwnedFollowingTransaction`, common stock, D/I labelled) and **computed %** = shares owned ÷ latest `EntityCommonStockSharesOutstanding` dated on or before that point — show both as-of dates.
  2. **Reported beneficial ownership %** from 13D/A cover data (may include warrants/options exercisable within 60 days).
- Explain in plain words: share count owned ≠ ownership percentage; new shares (warrant exercises, conversions, offerings) dilute the % even if RC buys more.
- Every point has a tooltip with its source filing. Never use finance-site percentages.

### 11.5 Capital Structure (`/capital`)
- `data/capital-structure.json`: populate it by actually reading the relevant 8-Ks (items 1.01/2.03), indenture exhibits and the latest 10-Q/10-K notes. Each instrument: name, type, principal, coupon, maturity, conversion rate (shares per $1,000), conversion price, conversion conditions, capped call (if any), repurchases/redemptions, outstanding amount with as-of date, and `sources[]` (label, URL, accession, section) for **every** non-null field, plus `verifiedAt`.
- `npm run verify:capital` fails if any non-null field lacks a source.
- If a 10-Q/10-K was filed after `verifiedAt`, show `NEWER FILING AVAILABLE — data may be stale`.
- Visual flow per instrument: **Cash raised → Debt outstanding → Conversion conditions → Possible future shares** (also as % of current shares outstanding from XBRL). Warrants too: warrants outstanding → cash if all exercised → possible new shares. Mechanics only — no good/bad labels.
- Anything you cannot verify stays null and is listed in your report.

### 11.6 Treasury Watch (`/treasury`)
- XBRL time series (latest + prior quarters): cash & equivalents, marketable securities/short-term investments, debt/convertibles, crypto/Bitcoin (only if tagged). Each value cites tag, period, form, filed date.
- Plus a filtered feed of Bitcoin/treasury/investment-policy items from SEC and IR.

### 11.7 M&A Watch (`/ma`)
- Watched counterparties in config (default eBay); adding another ticker should just work.
- Three columns, assigned **strictly by source**:
  - **CONFIRMED FACT** — SEC filings by/about GameStop and watched counterparties; official GameStop releases/documents (including the IR eBay page); counterparty 8-K / SC 14D9. Official @gamestop / @ryancohen posts about M&A appear here tagged `OFFICIAL STATEMENT` with the note "confirms it was said, not that it will happen".
  - **RELIABLE REPORTING** — T1/T2 news.
  - **RUMOUR / SPECULATION** — T3, opinion, unknown sources.
- A dated timeline of confirmed events on top; the IR eBay page's document list below.

## 12. Privacy & security
- `DASHBOARD_PASSWORD` set → HTTP Basic Auth on all pages and API routes (using the middleware/proxy mechanism of the installed Next version). Unset → public site; README must state clearly that the position panel is then visible to anyone with the URL.
- Secrets only in server env; `.env.local` gitignored; `.env.example` committed with placeholders only.
- After `next build`, a script greps `.next/static` for secret names/values — must find none.
- External links `target="_blank" rel="noopener noreferrer"`. Source text is rendered as text, never HTML.

## 13. `.env.example` (placeholders only)
```env
# Required
SEC_USER_AGENT="GME Live Wire your-name your-email@example.com"
# Optional, paid (X pay-per-use)
X_BEARER_TOKEN=
X_HANDLES=ryancohen,larryvc,gamestop
X_POLL_SECONDS=300
X_INCLUDE_REPLIES=true
X_INCLUDE_REPOSTS=false
# Optional market data (e.g. finnhub)
MARKET_DATA_PROVIDER=
MARKET_DATA_API_KEY=
# Recommended
DASHBOARD_PASSWORD=
# Personal position (real values go in .env.local / Vercel only)
POSITION_JSON={"shares":{},"warrants":{},"warrantDeadlines":{}}
WATCH_COUNTERPARTY_TICKERS=EBAY
DISPLAY_TIMEZONE=Australia/Brisbane
```

## 14. Testing (all must pass before "done")
- **Unit (Vitest):** scoring incl. every §8 trap; normalizers; dedupe/clustering; Form 4 parser on ≥ 3 real fixtures (multi-row, footnoted weighted-average price, derivative row if one exists); 13D parser on both §3 fixtures; warrant countdown across time zones with fixed "now" values; X normalizer; health/degradation logic.
- **API:** force each source to fail (bad URL, timeout, missing env) → `/api/feed` still returns 200 with correct health statuses; missing X token → `setup`, no crash.
- **Static:** `tsc --noEmit`, lint, `next build` clean; no hydration warnings in the browser console.
- **Smoke:** run the production build locally, curl every API route, load the page.
- **Visual:** if Playwright is available, screenshot 1440×900 and 390×844, look at them, fix layout issues.
- **Security:** the bundle secret grep.
- **Independent audit:** spawn a fresh subagent that hasn't seen your work to review the codebase for (a) hard-coded or sample content that could reach the UI, (b) secret exposure, (c) numbers displayed without a source. Fix what it finds.

## 15. Milestones (each ends with tests + commit)
- **M0 — Foundation:** docs (SPEC, CLAUDE, PLAN, DECISIONS); scaffold; design tokens; layout shell (header, clocks, stats, nav, sidebar) with real empty states.
- **M1 — Core wire (first usable product):** SEC (GME + eBay) + IR (feed, eBay page, warrant page, 8-K fallback) + News → unified feed, scoring with reasons, dedupe/clusters, filters, search, watch words, saved items, timeline view, source health, stat cards, polling/refresh, My Position, warrant countdown + mechanics, password gate, responsive layout, Dockerfile, README with Vercel steps.
  *Accept when:* real GameStop items render from SEC/IR/News; breaking any one source shows degraded/error while the rest work; nothing fabricated; all tests pass; deployable.
- **M2 — Insider intelligence:** Form 4 parser, `/api/insiders`, INSIDERS page, parsed Form 4 titles, RC/LC highlighting, RC alert card, 13D parser, XBRL shares outstanding, RC TRACKER.
- **M3 — X integration:** full code path, cost controls, health states; verified in `setup` state without a token, and live if I provide one.
- **M4 — Company intelligence:** XBRL fundamentals, TREASURY, CAPITAL STRUCTURE (curated JSON + verify script + stale banner), M&A WATCH, full WARRANTS page.
- **M5 — Polish:** optional market-data adapter, accessibility pass, performance (virtualize the feed if > 300 items), independent audit, final report.

If time or context runs short, finish the current milestone cleanly rather than half-starting the next.

## 16. Out of scope now (leave the seams, don't build)
- AI filing summaries (WHAT HAPPENED / WHY IT MATTERS / SHAREHOLDER, DILUTION & CASH IMPACT / WHAT TO WATCH), grounded only in the filing text and shown beside the original — leave a slot in the item detail view.
- Alerts via email/Telegram/Discord/push (needs scheduled jobs + persistent store). Optional in M5 only: opt-in browser notification for new HIGH items while the tab is open.
- COMMUNITY RADAR (Reddit, Superstonk, WSB, Stocktwits) — when built, it must be a separate, visually distinct section labelled `COMMUNITY / UNVERIFIED` and never enter the main feed.
- User accounts / database.

## 17. README
Project description · local setup (`npm install`, `cp .env.example .env.local`, `npm run dev`) · env var table · SEC usage and fair-access notes · X setup (developer console → create app → bearer token → buy credits → **set a monthly spending limit**) with the cost formula · ASCII architecture diagram · Vercel deployment step by step (GitHub import → env vars → deploy → check `/api/health`) · Render/Railway via Docker · known limitations (polling not streaming; per-instance cache; Google News redirect links; IR feed endpoint may change; NYSE holidays; X costs money) · roadmap.

## 18. Final report (reply to me in this format)
1. What's built, by module.
2. What's verified **live** vs only against fixtures.
3. Exactly which credentials/values I must supply, and where.
4. Copy-paste deployment steps.
5. Known limitations and risks.
6. Decisions you made that I might want to revisit (see DECISIONS.md).
7. The recommended next milestone.
