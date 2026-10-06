# Test fixtures — SYNTHETIC

**These files are NOT real captures.** The build sandbox had no network access to sec.gov, news.google.com,
investor.gamestop.com or x.com, so every fixture here was hand-written to follow the publicly documented
formats (EDGAR ownership XML, submissions JSON, companyfacts, Google News RSS, Q4 press-release JSON, X API v2).
All names, numbers and accession numbers are invented (`0000000000-26-0000NN`).

Rules:
- Used by `tests/**` only. Never imported by production code, never UI fallback data.
- Each file starts with a `SYNTHETIC TEST FIXTURE` marker.

To replace them with real, trimmed captures, run from a machine with access:

    SEC_USER_AGENT="Your Name you@example.com" npm run capture:fixtures

then re-run `npm test` and fix any parser differences the real data reveals (notably the 13D/13G element names).
