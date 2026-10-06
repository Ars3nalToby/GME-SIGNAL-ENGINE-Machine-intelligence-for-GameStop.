export const GME = { cik: "0001326380", name: "GameStop Corp.", ticker: "GME" } as const;

/** Used only if resolving a ticker through sec.gov/files/company_tickers.json fails. */
export const COUNTERPARTY_FALLBACK_CIKS: Record<string, string> = { EBAY: "0001065088" };

export const DEFAULT_WATCH_WORDS = ["eBay", "Form 4", "convertible", "warrant", "acquisition", "Bitcoin", "offering", "buyback"];

/** Forms kept from a watched counterparty's filing list (M&A-relevant only). */
export const COUNTERPARTY_FORMS = new Set([
  "8-K", "SC TO-T", "SC TO-C", "SC TO-I", "SC 14D9", "425", "DEFC14A", "PREC14A", "DFAN14A", "DEFA14A",
  "SC 13D", "SC 13D/A", "SCHEDULE 13D", "SCHEDULE 13D/A",
]);

export const X_ACCOUNT_META: Record<string, { initials: string; label: string }> = {
  ryancohen: { initials: "RC", label: "Ryan Cohen" },
  larryvc: { initials: "LC", label: "Larry Cheng" },
  gamestop: { initials: "GS", label: "GameStop" },
};

/** News relevance gate: an item must mention one of these. */
export const NEWS_RELEVANCE = /\b(gamestop|game stop|gme|ryan cohen|larry cheng)\b/i;

export const NEWS_QUERIES: { id: string; q: string }[] = [
  { id: "core", q: '"GameStop" OR GME' },
  { id: "people", q: '"Ryan Cohen" OR "Larry Cheng"' },
  { id: "ma", q: 'GameStop (eBay OR acquisition OR "tender offer" OR takeover)' },
  { id: "capital", q: 'GameStop (convertible OR warrants OR offering OR Bitcoin OR insider OR "Form 4")' },
];

export const IR_BASE = "https://investor.gamestop.com";
export const IR_PAGES = {
  ebay: `${IR_BASE}/eBay/default.aspx`,
  warrants: `${IR_BASE}/warrant-dividend/default.aspx`,
  newsroom: `${IR_BASE}/newsroom`,
  releases: `${IR_BASE}/news-releases/default.aspx`,
} as const;

/**
 * Standard Q4 Inc. press-release JSON service — the *candidate* default (not verified live from the build
 * sandbox). Override with IR_FEED_URL once the real endpoint is confirmed.
 */
export const IR_FEED_CANDIDATE =
  `${IR_BASE}/feed/PressRelease.svc/GetPressReleaseList?LanguageId=1&bodyType=0&pressReleaseDateFilter=3` +
  `&categoryId=1cb807d2-208f-4bc3-9133-6a9ad45ac3b0&pageSize=-1&pageNumber=0&tagList=&includeTags=true&year=-1&excludeSelection=1`;

/** NYSE full-day closures (2026) per the published NYSE calendar. Early closes are not modelled. */
export const NYSE_HOLIDAYS = [
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
];

/** Warrant terms (config, not hard-coded content): see SPEC §3 / §11.2. Terms may be adjusted. */
export const WARRANT_TERMS = {
  symbol: "GME WS",
  exercisePriceUsd: 32,
  sharesPerWarrant: 1,
  expiryLocal: "2026-10-30T17:00:00",
  expiryZone: "America/New_York",
  termsUrl: `${IR_BASE}/warrant-dividend/default.aspx`,
} as const;

export const BRISBANE_ZONE = "Australia/Brisbane";
export const NY_ZONE = "America/New_York";
