// Regression tests for the independent audit's findings.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { dedupe } from "@/lib/dedupe";
import { TtlCache } from "@/lib/cache";
import { getEnv } from "@/lib/config/env";
import { tierOf } from "@/lib/config/publishers";
import { positionExposed, readPositionForRender } from "@/lib/config/position";
import { checkBasicAuth, config as proxyConfig, proxy } from "@/proxy";
import { buildMa } from "@/lib/ma";
import { parseIrFeed, parseIrPage } from "@/lib/sources/ir";
import { nyseSession, parseIrDateEx } from "@/lib/time";
import { sourcedPossibleShares, sourcedValue, parseCapital } from "@/lib/capital";
import { buildSecItem, type SecRow } from "@/lib/sources/sec";
import { cache } from "@/lib/cache";
import { classifyXError, loadX, resetXState } from "@/lib/sources/x";
import { loadMarket } from "@/lib/sources/market";
import { fmtWhen } from "@/lib/format";
import { fixture, jsonRes, stubFetch, text } from "./helpers";
import type { WireItem } from "@/lib/types";

const news = (o: Partial<WireItem>): WireItem => ({
  id: "news:same", sourceType: "news", source: "S", credibility: "reporting", title: "Same headline about GameStop acquisition", publishedAt: "2026-10-05T10:00:00.000Z", fetchedAt: "x",
  url: "https://e.test/" + Math.random(), people: [], tags: [], score: 60, signal: "medium", scoreReasons: [], newsTier: "t2", outlet: "O", ...o,
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("audit #5: dedupe never deletes the representative", () => {
  it("same headline on consecutive days (equal ids) keeps one item, not zero", () => {
    const a = news({ publishedAt: "2026-10-05T10:00:00.000Z", outlet: "A", url: "https://e.test/a" });
    const b = news({ publishedAt: "2026-10-06T10:00:00.000Z", outlet: "B", url: "https://e.test/b" });
    const out = dedupe([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0]!.cluster?.count).toBe(1);
  });
});

describe("audit #6: a bad optional env value never takes the app down", () => {
  it("invalid X_POLL_SECONDS falls back to the default and is reported", () => {
    const e = getEnv({ X_POLL_SECONDS: "30", SEC_USER_AGENT: "x y@z.com" });
    expect(e.xPollSeconds).toBe(300);
    expect(e.secUserAgent).toBe("x y@z.com");
    expect(e.problems[0]).toContain("X_POLL_SECONDS");
    expect(getEnv({ X_POLL_SECONDS: "abc" }).xPollSeconds).toBe(300);
    expect(getEnv({}).problems).toEqual([]);
  });
});

describe("audit #1: personal holdings are never rendered on a public site", () => {
  const raw = '{"shares":{"A":1},"warrants":{"A":1},"warrantDeadlines":{}}';
  it("hidden without a password; visible with one or with explicit opt-in", () => {
    expect(readPositionForRender({ POSITION_JSON: raw }).status).toBe("hidden");
    expect(readPositionForRender({ POSITION_JSON: raw }).totalShares).toBe(0);
    expect(readPositionForRender({ POSITION_JSON: raw, DASHBOARD_PASSWORD: "pw" }).status).toBe("set");
    expect(readPositionForRender({ POSITION_JSON: raw, ALLOW_PUBLIC_POSITION: "1" }).status).toBe("set");
    expect(readPositionForRender({}).status).toBe("empty");
    expect(positionExposed({ POSITION_JSON: raw, ALLOW_PUBLIC_POSITION: "1" })).toBe(true);
    expect(positionExposed({ POSITION_JSON: raw, DASHBOARD_PASSWORD: "pw", ALLOW_PUBLIC_POSITION: "1" })).toBe(false);
  });
});

describe("audit #2: ?force=1 cannot beat the X poll interval (X bills per post)", () => {
  beforeEach(() => {
    cache.clear();
    resetXState();
    vi.stubEnv("X_BEARER_TOKEN", "t");
    vi.stubEnv("X_HANDLES", "gamestop");
  });
  it("forced reloads inside the poll window do not call the API again", async () => {
    let timeline = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/users/by")) return jsonRes({ data: [{ id: "1", username: "gamestop" }] });
      timeline++;
      return jsonRes({ data: [] });
    }));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-10-06T00:00:00Z"));
    await loadX({ nowMs: Date.now() });
    vi.setSystemTime(Date.now() + 120_000); // 2 min: older than 30s but inside the 300s poll interval
    await loadX({ nowMs: Date.now(), force: true });
    vi.setSystemTime(Date.now() + 200_000); // now past 300s
    await loadX({ nowMs: Date.now(), force: true });
    vi.useRealTimers();
    expect(timeline).toBe(2);
    expect(classifyXError(429, "{}", null, 0).kind).toBe("rate");
  });
});

describe("audit #14: stale entries are not hammered either", () => {
  it("after a failed refresh with a stale copy, the loader is not retried inside the backoff", async () => {
    let t = 1_000_000;
    const c = new TtlCache(() => t);
    let calls = 0;
    await c.get("k", 10_000, async () => "good");
    t += 20_000;
    const bad = async () => {
      calls++;
      throw new Error("503");
    };
    expect((await c.get("k", 10_000, bad)).stale).toBe(true);
    expect((await c.get("k", 10_000, bad)).stale).toBe(true);
    expect(calls).toBe(1);
    t += 11_000;
    await c.get("k", 10_000, bad);
    expect(calls).toBe(2);
  });
});

describe("audit #15: publisher tiers use word boundaries and demote opinion sections", () => {
  it("look-alikes and opinion sections do not inherit T1", () => {
    expect(tierOf("Reuters")).toBe("t1");
    expect(tierOf("Bloomberg")).toBe("t1");
    expect(tierOf("Bloomberg Opinion")).toBe("opinion");
    expect(tierOf("Reuters Breakingviews")).toBe("opinion");
    expect(tierOf("notreuters.biz")).toBe("t3");
    expect(tierOf("Reuters.com")).toBe("t1");
    expect(tierOf("The Wall Street Journal")).toBe("t1");
    expect(tierOf("AP")).toBe("t1");
    expect(tierOf("MAPS Daily")).toBe("t3");
  });
});

describe("audit #10: proxy hardening", () => {
  it("accepts lowercase scheme and non-ASCII (UTF-8) passwords", () => {
    const hdr = (pw: string) => `basic ${Buffer.from(`u:${pw}`, "utf8").toString("base64")}`;
    expect(checkBasicAuth(hdr("pässwörd-密码"), "pässwörd-密码")).toBe(true);
    expect(checkBasicAuth(hdr("nope"), "pässwörd-密码")).toBe(false);
  });
  it("matcher exclusions are end-anchored: look-alike paths stay gated", () => {
    const re = new RegExp(`^${proxyConfig.matcher[0]!}$`);
    expect(re.test("/healthz")).toBe(false);
    expect(re.test("/healthz-debug")).toBe(true);
    expect(re.test("/icon.svgX")).toBe(true);
    expect(re.test("/icon.svg")).toBe(false);
    expect(re.test("/api/feed")).toBe(true);
    process.env.DASHBOARD_PASSWORD = "x";
    try {
      expect(proxy(new NextRequest("http://l/healthz-debug")).status).toBe(401);
    } finally {
      delete process.env.DASHBOARD_PASSWORD;
    }
  });
});

describe("audit #8: M&A lanes", () => {
  const x = (o: Partial<WireItem>): WireItem => news({ sourceType: "x", handle: "ryancohen", title: "eBay thoughts", id: "x:" + Math.random(), tags: ["X"], newsTier: undefined, ...o });
  it("official replies/reposts never land in CONFIRMED FACT (or anywhere on the M&A page)", () => {
    const m = buildMa([x({}), x({ tags: ["X", "Reply"] }), x({ tags: ["X", "Repost"] })], ["eBay Inc."]);
    expect(m.confirmed).toHaveLength(1);
    expect(m.rumour).toHaveLength(0);
  });
  it("no counterparties configured ⇒ no hard-coded eBay matching", () => {
    expect(buildMa([news({ title: "eBay results", id: "a" })], []).rumour).toHaveLength(0);
  });
});

describe("audit #7: dates are only taken from the link's own row, and date-only stays date-only", () => {
  it("a link without its own date does not inherit a neighbour's", () => {
    const html = `<main><ul><li><span>05/05/2026</span> <a href="/news-releases/news-release-details/a">Entry A with its own date here</a>
      <a href="/news-releases/news-release-details/b">Entry B in the same list item without date</a></li></ul>
      <div><a href="/news-releases/news-release-details/c">Entry C standalone news link no date</a><p>Stray text 01/01/2020</p></div></main>`;
    const e = parseIrPage(html, "https://investor.gamestop.com/x");
    const byTitle = (t: string) => e.find((x) => x.title.startsWith(t))!;
    expect(byTitle("Entry A").date).toBeDefined();
    expect(byTitle("Entry C").date).toBeUndefined(); // parent text has a date, but it is not the link's own row
  });
  it("date-only values are flagged and rendered without a clock time", () => {
    expect(parseIrDateEx("05/05/2026")!.dateOnly).toBe(true);
    expect(parseIrDateEx("10/07/2025 16:05:00")!.dateOnly).toBe(false);
    const e = parseIrFeed(JSON.parse(fixture("ir-feed.json")));
    expect(e[0]!.dateOnly).toBe(false);
    expect(fmtWhen({ publishedAt: "2026-05-05T16:00:00.000Z", dateOnly: true })).toBe("05 May 2026 (date only)");
    expect(fmtWhen({ publishedAt: "2026-05-05T16:00:00.000Z" })).toContain("AEST");
  });
});

describe("audit #16: NYSE calendar boundary", () => {
  it("flags dates beyond the configured holiday list", () => {
    expect(nyseSession(Date.parse("2026-10-06T15:00:00Z")).calendarKnown).toBe(true);
    expect(nyseSession(Date.parse("2027-03-02T15:00:00Z")).calendarKnown).toBe(false);
  });
});

describe("audit #3: capital values need a source", () => {
  const src = (field: string) => ({ field, label: "8-K", url: "https://www.sec.gov/x", accession: "0000000000-26-000001" });
  const cap = parseCapital({ instruments: [{ name: "N", principal: 1000, outstanding: 1_000_000, conversionRate: 20, coupon: 0, sources: [src("outstanding"), src("conversionRate")] }] });
  const inst = cap.instruments[0]!;
  it("unsourced values are withheld, sourced ones carry their source", () => {
    expect(sourcedValue<number>(inst as never, "principal")).toMatchObject({ value: null, unsourced: true });
    expect(sourcedValue<number>(inst as never, "outstanding").src?.accession).toBe("0000000000-26-000001");
    expect(sourcedValue<number>(inst as never, "maturity")).toMatchObject({ value: null, unsourced: false });
    expect(sourcedPossibleShares(inst)).toBe(20_000);
    expect(sourcedPossibleShares({ ...inst, sources: [src("outstanding")] })).toBeNull();
  });
});

describe("audit #13 / #17: SEC item edge cases", () => {
  const ctx = { gmeCik: "0001326380", counterparties: [{ ticker: "EBAY", cik: "0001065088", name: "eBay Inc." }], nowIso: "now", form345Window: new Set<string>() };
  const row = (o: Partial<SecRow>): SecRow => ({ listCik: "0001326380", listName: "", accession: "0000000000-26-000099", form: "4", filingDate: "2026-01-01", items: [], primaryDocument: "xslF345X05/f.xml", publishedAt: "2026-01-01T00:00:00.000Z", ...o });
  it("old Form 4s outside the parse window are labelled not parsed, never 'details loading' forever", () => {
    const { item } = buildSecItem(row({}), ctx);
    expect(item.title).toContain("not parsed (older than the latest 60");
    expect(item.parseNote).toBe("unparsed");
  });
  it("a 13D with unparsed subject in a counterparty's list is not assumed to be about that counterparty", () => {
    const { item } = buildSecItem(row({ form: "SCHEDULE 13D/A", primaryDocument: "d.htm", listCik: "0001065088", counterparty: "EBAY", accession: "0000000000-26-000098" }), ctx);
    expect(item.score).toBe(92);
    expect(item.tags).not.toContain("M&A");
  });
  it("filings with no acceptance time are flagged date-only", async () => {
    const { resolveRowTimes } = await import("@/lib/sources/sec");
    const r = resolveRowTimes([{ listCik: "1", listName: "", accession: "a", form: "4", filingDate: "2026-10-05", items: [] }], "UTC", Date.parse("2026-10-06T00:00:00Z"));
    expect(r.rows[0]!.dateOnly).toBe(true);
  });
});

describe("audit #9: warrant symbol", () => {
  beforeEach(() => cache.clear());
  it("a configured symbol is the only one tried and is reported; guesses are flagged", async () => {
    vi.stubEnv("MARKET_DATA_PROVIDER", "finnhub");
    vi.stubEnv("MARKET_DATA_API_KEY", "k");
    const seen: string[] = [];
    stubFetch([[/finnhub/, (u) => { seen.push(new URL(u).searchParams.get("symbol")!); return jsonRes({ c: 5, t: 1_790_000_000 }); }]]);
    vi.stubEnv("MARKET_WARRANT_SYMBOL", "GME.WS");
    const a = await loadMarket({ force: true });
    expect(a.snapshot!.warrantSymbolIsGuess).toBe(false);
    expect(a.snapshot!.warrant!.symbol).toBe("GME.WS");
    expect(seen).toEqual(["GME", "GME.WS"]);
    cache.clear();
    vi.stubEnv("MARKET_WARRANT_SYMBOL", "");
    const b = await loadMarket({ force: true });
    expect(b.snapshot!.warrantSymbolIsGuess).toBe(true);
    void text;
  });
});

describe("IR page requests identify themselves honestly", () => {
  it("send a descriptive, non-browser user-agent on the server-rendered IR pages", async () => {
    const { loadIrPages, IR_PAGE_HEADERS } = await import("@/lib/sources/ir");
    cache.clear();
    const seen: Record<string, string>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input), ...(init?.headers as Record<string, string>) });
      return new Response("<html></html>", { status: 200 });
    }));
    await loadIrPages(true);
    expect(seen.length).toBe(3);
    for (const s of seen) {
      expect(s["user-agent"]).toBe(IR_PAGE_HEADERS["user-agent"]);
      expect(s["user-agent"]).not.toMatch(/Mozilla|Chrome|Safari|Gecko/i); // no browser impersonation
    }
  });
});

describe("IR page problems are explained plainly", () => {
  it("403 gets a human explanation; other errors keep their text", async () => {
    const { irPageProblem } = await import("@/lib/format");
    expect(irPageProblem("HTTP 403")).toContain("refuses automated access");
    expect(irPageProblem("HTTP 503")).toBe("IR page unavailable — HTTP 503");
    expect(irPageProblem(undefined)).toBe("Nothing was extracted from the IR page.");
  });
});
