# PLAN — milestone checklist (see SPEC §15)

Environment: the build sandbox cannot reach SEC / Google News / GameStop IR / X / Finnhub (egress policy 403). Every external code path is fixture-tested (SYNTHETIC fixtures) and listed "not verified live" in the final report. The full stack was additionally exercised end-to-end through a verification-only fetch shim (`scripts/mock-external.cjs`).

- [x] **M0 — Foundation**: docs, scaffold, tokens, layout shell (header, clocks, stats, nav, sidebar) with real empty states
- [x] **M1 — Core wire**: SEC (GME + counterparties) · IR (feed, eBay page, warrant page, 8-K fallback) · News · scoring · dedupe/clusters · filters/search/chips/saved/timeline · health · polling · My Position · warrant countdown · password gate · Dockerfile · README
- [x] **M2 — Insider intelligence**: Form 3/4/5 parser · /api/insiders · INSIDERS · RC alert card · 13D/13G parser · XBRL shares outstanding · RC TRACKER
- [x] **M3 — X integration**: client, cost controls, health states (verified in `setup` state; live path fixture/shim-tested only — no token)
- [x] **M4 — Company intelligence**: fundamentals · TREASURY · CAPITAL (curated JSON + verify script + stale banner; ships empty) · M&A WATCH · WARRANTS page
- [x] **M5 — Polish**: market adapter · a11y pass · incremental rendering for long feeds · bundle secret grep · independent audit · final report

Note: M1–M4 were built together (the modules share the SEC pipeline), so their code lands in one commit.
