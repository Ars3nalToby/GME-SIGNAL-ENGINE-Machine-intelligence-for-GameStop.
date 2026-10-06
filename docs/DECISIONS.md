# Decisions log

One line each: decision — reason.

- **Committed `docs/SPEC.md` has the owner's real position numbers redacted**; verbatim brief kept in gitignored `docs/SPEC.local.md` — §11.1/§12 say personal holdings must never be committed.
- **Next 16.3 / React 19 / Tailwind 4 / TypeScript 5.9 / ESLint 9** — current stable Next+React; TS 7 and ESLint 10 are newer than `eslint-config-next@16` and Next's TS plugin officially support, so pinned one major back for toolchain stability.
- **`luxon` as the timezone-aware date library** — mature IANA-zone support, tiny API surface needed here (zone conversion, DST-correct NY expiry).
- **Sandbox has no egress to sec.gov / news.google.com / investor.gamestop.com / x.com / finnhub.io** (proxy 403 on CONNECT, WebFetch also EGRESS_BLOCKED) — all parsers were written against documented/known formats and tested on SYNTHETIC fixtures (clearly labelled, never imported by production code); `npm run capture:fixtures` replaces them with real captures from a connected machine. Everything depending on this is "not verified live" in the report.
- **IR press-release endpoint** — could not inspect the page's scripts; implemented the standard Q4 Inc. `/feed/PressRelease.svc/GetPressReleaseList` JSON service as the default candidate plus script-scanning discovery from `/news-releases/default.aspx`, overridable via `IR_FEED_URL`. If it fails, IR shows `error`/`degraded` and the 8-K Ex. 99.1 fallback is used (`via SEC 8-K`).
- **SEC `acceptanceDateTime` timezone** — cannot compare with index-page "Accepted" times from here. Implementation infers the zone from EDGAR's 06:00–22:00 ET acceptance window (UTC vs Eastern wall-clock hypothesis), honours `SEC_ACCEPTANCE_TZ`, falls back to the literal `Z` (UTC) reading, and clamps any future timestamp. `scripts/verify-acceptance.mjs` does the proper index-page comparison from a connected machine. UNVERIFIED.
- **13D/13G XML parsing is schema-tolerant** (key-pattern search, not fixed paths) because the two reference fixtures could not be fetched; anything not found ⇒ `partial`/`UNPARSED` with filing link, never guessed.
- **SEC items are scored from the §8 table only (no keyword boosts)** except 424B/S-3 text rule — keeps the SEC table deterministic and avoids stacking boosts on already-ranked forms.
- **News keyword boost cap +20 applies to keyword groups; the T1/T2 "exclusive" +15 is added separately, then clamped to the tier cap.** On its own that reaches only 85 with a fully stacked headline, so a documented **floor of 85 applies to T1 "exclusive/sources/people familiar" + M&A-hit items** to satisfy the required test "T1 exclusive on an acquisition → HIGH". Revisit if you want T2 treated the same.
- **NYSE holidays listed in `lib/config/watch.ts` (2026)** from the NYSE published calendar; UI states "holidays per config". Early-close days are not modelled.
- **Capital structure JSON ships empty (`instruments: []`, `verifiedAt: null`)** — brief requires every figure to be read from filings and sourced; nothing could be read in this sandbox, and recalled figures are not acceptable sources. `/capital` lists candidate 8-K (1.01/2.03/3.02) and 10-Q/10-K filings from the live SEC feed to curate from.
- **Ryan Cohen / Larry Cheng identified by name patterns on reporting-owner names** (no hard-coded CIKs, none verifiable here).
- **Filer/subject for 425 / SC TO / 14D9 / 13D-without-XML resolved from the SEC SGML header** (`<accession>.txt`, first 16 KB read via streaming) — the JSON lists don't carry the direction. 13D XML `issuerInfo` also used.
- **Per-cycle budget of 10 uncached filing documents** covers XML parses, index.json lookups and SGML headers together (priority: 13D family → Form 3/4/5 → 8-K Ex.99.1 → other direction lookups).
- **Fonts via `next/font/local` with Fontsource files** — `next/font/google` needs build-time network access; same Inter + IBM Plex Mono, still through `next/font`.
- **Client-safe vs server-only split** (`lib/config/watch.ts` constants vs `lib/config/env.ts`, `lib/health-view.ts` vs `lib/health.ts`, `lib/insider-math.ts`) with `server-only` on server modules — keeps secret names and the XML parser out of the client bundle (the bundle scan caught a leak of an env-var *name* in a help string, now reworded).
- **IR ↔ 8-K Ex. 99.1 is cross-linked, not folded** (the 8-K card carries a "Press release (Ex. 99.1)" link) — folding would hide a HIGH-scored filing from the SEC filter. News ↔ IR (Jaccard ≥ 0.8) does fold.
- **Same-title/same-day exact dedupe applies to news only**; SEC filings and X posts are never merged by title (a test caught two identical "details loading" Form 4 titles being merged). Output ids are forced unique.
- **Nested stale-on-error is propagated**: if the submissions list itself is stale, the whole SEC source reports `degraded` (a test caught it reporting `live`).
- **`/healthz` is the only ungated route** (returns `{ok:true}`) so Docker/Render health checks work behind the password gate; `/api/health` stays gated.
- **EDGAR owner names shown as filed ("Doe Jane")**, only the two tracked people are mapped to "Ryan Cohen"/"Larry Cheng" — reordering other names would be a guess.
- **Price shown with ≥ 2 decimals and up to 4 when the filing has more**; value = shares × price only when both parsed; weighted-average prices are flagged `avg — see footnote` with the footnote text.
- **Feed windowing is incremental rendering** (60 cards, "Show more"), not true virtualisation — fine for the expected < 300 items; listed in the roadmap.
- **Opt-in browser notifications (optional M5) not built.**
- **Warrant quote symbol candidates (`GME.WS`, `GMEWS`, `GME-WT`) are guesses at provider symbology**; shown with provider name so the user can sanity-check.
- **Docker image not built here** (no usable daemon / registry access); the standalone server it runs was verified.
