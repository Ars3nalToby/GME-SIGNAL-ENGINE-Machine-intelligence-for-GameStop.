import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { readPosition } from "@/lib/config/position";
import { getEnv } from "@/lib/config/env";
import { applyFilters, matchesQuery, isPeopleItem } from "@/lib/filters";
import { checkBasicAuth, proxy } from "@/proxy";
import { warrantMath } from "@/lib/sources/market";
import { extractFundamentals, sharesOutstandingAsOf } from "@/lib/sources/xbrl";
import { buildRcSeries, type InsidersPayload } from "@/lib/insiders";
import { safeHref } from "@/lib/url";
import { personKey, peopleIn } from "@/lib/people";
import { fixture } from "./helpers";
import type { WireItem } from "@/lib/types";

const item = (o: Partial<WireItem>): WireItem => ({
  id: "i", sourceType: "news", source: "S", credibility: "reporting", title: "t", publishedAt: "2026-10-05T10:00:00.000Z", fetchedAt: "x", url: "https://e.test", people: [], tags: [], score: 50, signal: "low", scoreReasons: [], ...o,
});

describe("My Position", () => {
  const raw = JSON.stringify({ shares: { A: 10, B: 5 }, warrants: { A: 3, B: 2 }, warrantDeadlines: { A: null, B: "2026-10-27T17:00" } });
  it("computes totals — never typed in", () => {
    const p = readPosition(raw);
    expect(p).toMatchObject({ status: "set", totalShares: 15, totalWarrants: 5, venues: ["A", "B"] });
    expect(p.warrantDeadlines).toEqual({ A: null, B: "2026-10-27T17:00" });
  });
  it("empty / invalid are explicit states", () => {
    expect(readPosition("").status).toBe("empty");
    expect(readPosition('{"shares":{},"warrants":{},"warrantDeadlines":{}}').status).toBe("empty");
    expect(readPosition("{nope").status).toBe("invalid");
    expect(readPosition('{"shares":{"A":-1}}').status).toBe("invalid");
  });
});

describe("env", () => {
  it("defaults", () => {
    const e = getEnv({});
    expect(e).toMatchObject({ xHandles: ["ryancohen", "larryvc", "gamestop"], xPollSeconds: 300, xIncludeReplies: true, xIncludeReposts: false, counterpartyTickers: ["EBAY"], displayTz: "Australia/Brisbane", acceptanceTz: "auto" });
    expect(e.xToken).toBeUndefined();
    expect(getEnv({ X_BEARER_TOKEN: "  " }).xToken).toBeUndefined();
  });
  it("overrides", () => {
    const e = getEnv({ X_HANDLES: "@Foo, bar", X_POLL_SECONDS: "600", WATCH_COUNTERPARTY_TICKERS: "ebay,amzn", SEC_ACCEPTANCE_TZ: "UTC" });
    expect(e).toMatchObject({ xHandles: ["foo", "bar"], xPollSeconds: 600, counterpartyTickers: ["EBAY", "AMZN"], acceptanceTz: "UTC" });
  });
});

describe("password gate (proxy.ts)", () => {
  const basic = (pw: string, user = "me") => `Basic ${btoa(`${user}:${pw}`)}`;
  it("checkBasicAuth accepts the right password with any username", () => {
    expect(checkBasicAuth(basic("s3cret"), "s3cret")).toBe(true);
    expect(checkBasicAuth(basic("s3cret", ""), "s3cret")).toBe(true);
    expect(checkBasicAuth(basic("wrong"), "s3cret")).toBe(false);
    expect(checkBasicAuth(null, "s3cret")).toBe(false);
    expect(checkBasicAuth("Bearer abc", "s3cret")).toBe(false);
    expect(checkBasicAuth("Basic !!!notbase64", "s3cret")).toBe(false);
  });
  it("401 + WWW-Authenticate for pages and API when DASHBOARD_PASSWORD is set; open when unset", () => {
    process.env.DASHBOARD_PASSWORD = "s3cret";
    try {
      for (const path of ["/", "/api/feed", "/api/health", "/insiders"]) {
        const res = proxy(new NextRequest(`http://localhost${path}`));
        expect(res.status, path).toBe(401);
        expect(res.headers.get("www-authenticate")).toContain("Basic");
      }
      const ok = proxy(new NextRequest("http://localhost/api/feed", { headers: { authorization: basic("s3cret") } }));
      expect(ok.status).toBe(200);
    } finally {
      delete process.env.DASHBOARD_PASSWORD;
    }
    expect(proxy(new NextRequest("http://localhost/api/feed")).status).toBe(200);
  });
});

describe("filters & search", () => {
  const sec = item({ id: "s", sourceType: "sec", title: "FORM 4 · Ryan Cohen", people: ["ryan_cohen"], form: "4", tags: ["SEC", "Insider"], signal: "high" });
  const x = item({ id: "x", sourceType: "x", title: "post", people: ["ryan_cohen"], handle: "ryancohen" });
  const news = item({ id: "n", sourceType: "news", title: "GameStop eBay report", people: ["ryan_cohen"], outlet: "Reuters" });
  const ir = item({ id: "i", sourceType: "ir", title: "Release", tags: ["Warrants"] });
  const all = [sec, x, news, ir];
  const run = (o: Partial<Parameters<typeof applyFilters>[1]>) => applyFilters(all, { filter: "all", highOnly: false, query: "", savedIds: new Set(), saved: [], ...o }).map((i) => i.id);
  it("source filters", () => {
    expect(run({ filter: "sec" })).toEqual(["s"]);
    expect(run({ filter: "ir" })).toEqual(["i"]);
    expect(run({ filter: "news" })).toEqual(["n"]);
  });
  it("RYAN / LARRY = their X posts and SEC filings, not news mentioning them", () => {
    expect(run({ filter: "people" })).toEqual(["s", "x"]);
    expect(isPeopleItem(news)).toBe(false);
  });
  it("HIGH only; saved uses snapshots; query is AND over title/tags/source/form", () => {
    expect(run({ highOnly: true })).toEqual(["s"]);
    expect(run({ filter: "saved", saved: [ir] })).toEqual(["i"]);
    expect(matchesQuery(sec, "form 4 insider")).toBe(true);
    expect(matchesQuery(sec, "warrant")).toBe(false);
    expect(run({ query: "warrants" })).toEqual(["i"]);
    expect(run({ query: "reuters ebay" })).toEqual(["n"]);
  });
});

describe("misc helpers", () => {
  it("safeHref blocks non-http(s) schemes", () => {
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(safeHref("data:text/html,x")).toBeUndefined();
    expect(safeHref("https://sec.gov/a")).toBe("https://sec.gov/a");
    expect(safeHref(undefined)).toBeUndefined();
  });
  it("people detection by name pattern", () => {
    expect(personKey("Cohen Ryan")).toBe("ryan_cohen");
    expect(personKey("COHEN RYAN")).toBe("ryan_cohen");
    expect(personKey("Cheng Lawrence")).toBe("larry_cheng");
    expect(personKey("Cohen Rachel")).toBeUndefined();
    expect(peopleIn("Ryan Cohen and Larry Cheng meet")).toEqual(["ryan_cohen", "larry_cheng"]);
  });
  it("warrant math: facts only", () => {
    expect(warrantMath(40, 32, 9)).toEqual({ intrinsic: 8, timeValue: 1 });
    expect(warrantMath(20, 32, 0.5)).toEqual({ intrinsic: 0, timeValue: 0.5 });
    expect(warrantMath(20, 32, null).timeValue).toBeNull();
  });
});

describe("XBRL fundamentals (synthetic companyfacts)", () => {
  const f = extractFundamentals(JSON.parse(fixture("companyfacts-synthetic.json")), "now");
  it("shares outstanding series with as-of lookup (on or before)", () => {
    expect(f.shares.series.map((p) => p.end)).toEqual(["2026-06-05", "2026-03-10"]);
    expect(sharesOutstandingAsOf(f, "2026-04-01")!.val).toBe(447_000_000);
    expect(sharesOutstandingAsOf(f, "2026-06-05")!.val).toBe(449_000_000);
    expect(sharesOutstandingAsOf(f, "2026-01-01")).toBeUndefined();
  });
  it("each number carries tag, period, form, filed date and an accession link", () => {
    const cash = f.concepts.find((c) => c.id === "cash")!;
    expect(cash.status).toBe("ok");
    expect(cash.series[0]).toMatchObject({ tag: "CashAndCashEquivalentsAtCarryingValue", end: "2026-05-02", form: "10-Q/A", filed: "2026-06-20", accn: "0000000000-26-000102" });
    expect(cash.series[0]!.url).toContain("0000000000-26-000102-index.htm");
    expect(cash.series.map((p) => p.end)).toEqual(["2026-05-02", "2026-01-31"]); // one value per period end
  });
  it("discovers crypto tags from the data; absent concepts say not tagged", () => {
    const crypto = f.concepts.find((c) => c.id === "crypto")!;
    expect(crypto.tagsFound).toContain("gme:CryptoAssetFairValueSynthetic");
    const empty = extractFundamentals({ facts: { "us-gaap": {} } }, "now");
    expect(empty.concepts.every((c) => c.status === "not_tagged")).toBe(true);
  });
  it("same-filing multiple share counts are flagged ambiguous, not guessed", () => {
    const raw = JSON.parse(fixture("companyfacts-synthetic.json"));
    raw.facts.dei.EntityCommonStockSharesOutstanding.units.shares.push({ end: "2026-06-05", val: 5, accn: "0000000000-26-000101", form: "10-Q", filed: "2026-06-10" });
    const a = extractFundamentals(raw, "now");
    expect(a.shares.ambiguous).toBe(true);
    expect(a.shares.series.map((p) => p.accn)).not.toContain("0000000000-26-000101");
  });
});

describe("RC tracker series", () => {
  const f = extractFundamentals(JSON.parse(fixture("companyfacts-synthetic.json")), "now");
  const payload = {
    filings: [
      {
        accession: "A1", form: "4", filedAt: "2026-09-30T10:00:00.000Z", title: "t", url: "u", indexUrl: "i", owners: [], people: ["ryan_cohen"], parseStatus: "ok", holdings: [],
        txns: [
          { code: "P", date: "2026-04-01", shares: 100, pricePerShare: 10, value: 1000, sharesOwnedAfter: 4_470_000, isDerivative: false, securityTitle: "Class A Common Stock", directIndirect: "D" },
          { code: "X", date: "2026-07-01", shares: 5, isDerivative: true, securityTitle: "Warrants", sharesOwnedAfter: 3, directIndirect: "D" },
          { code: "P", date: "2026-07-01", shares: 1, pricePerShare: 1, value: 1, sharesOwnedAfter: 4_490_000, isDerivative: false, securityTitle: "Class A Common Stock", directIndirect: "I" },
        ],
      },
      { accession: "A2", form: "4", filedAt: "x", title: "t", url: "u", indexUrl: "i", owners: [], people: ["larry_cheng"], parseStatus: "ok", holdings: [], txns: [{ code: "P", date: "2026-07-01", sharesOwnedAfter: 9, isDerivative: false, securityTitle: "Class A Common Stock", directIndirect: "D" }] },
    ],
    sched13: [{ accession: "S1", form: "SCHEDULE 13D/A", filedAt: "2026-08-01T00:00:00.000Z", title: "t", url: "u", parse: { status: "ok", persons: [{ name: "Ryan Cohen", aggregateShares: 5_000_000, percentOfClass: 1.1 }], filerCiks: [] } }],
    health: {}, generatedAt: "x",
  } as unknown as InsidersPayload;
  it("keeps the two series separate: shares owned (+computed %, each with its outstanding as-of) vs reported beneficial %", () => {
    const s = buildRcSeries(payload, f);
    expect(s.shares).toHaveLength(2); // derivative row and other people excluded
    expect(s.shares[0]).toMatchObject({ date: "2026-04-01", sharesOwned: 4_470_000, directIndirect: "D" });
    expect(s.shares[0]!.outstanding!.end).toBe("2026-03-10");
    expect(s.shares[0]!.pct).toBeCloseTo((4_470_000 / 447_000_000) * 100);
    expect(s.shares[1]!.outstanding!.end).toBe("2026-06-05"); // latest dated on/before 2026-07-01
    expect(s.shares[1]!.directIndirect).toBe("I");
    expect(s.beneficial).toHaveLength(1);
    expect(s.beneficial[0]).toMatchObject({ pct: 1.1, shares: 5_000_000, form: "SCHEDULE 13D/A" });
    expect(s.purchases).toHaveLength(2);
  });
  it("without share-count facts the % is null (never invented)", () => {
    const s = buildRcSeries(payload, undefined);
    expect(s.shares.every((p) => p.pct === null && p.outstanding === undefined)).toBe(true);
  });
});
