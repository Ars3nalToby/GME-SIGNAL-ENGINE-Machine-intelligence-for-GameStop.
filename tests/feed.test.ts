import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cache } from "@/lib/cache";
import { resetSecLimiter, setSecIntervalForTests, getText, HttpError } from "@/lib/http";
import { docCache } from "@/lib/sources/sec";
import { resetXState } from "@/lib/sources/x";
import { buildFeed, irFallbackFromSec } from "@/lib/feed";
import { GET as feedGET } from "@/app/api/feed/route";
import { GET as healthGET } from "@/app/api/health/route";
import { GET as insidersGET } from "@/app/api/insiders/route";
import { GET as secGET } from "@/app/api/sec/route";
import { GET as irGET } from "@/app/api/ir/route";
import { GET as newsGET } from "@/app/api/news/route";
import { GET as xGET } from "@/app/api/x/route";
import { GET as fundGET } from "@/app/api/fundamentals/route";
import type { SourceHealth } from "@/lib/types";
import { fixture, jsonRes, stubFetch, text, type Route } from "./helpers";

const secRoutes: Route[] = [
  [/company_tickers\.json/, () => jsonRes(JSON.parse(fixture("company-tickers.json")))],
  [/submissions\/CIK0001326380\.json/, () => jsonRes(JSON.parse(fixture("submissions-gme.json")))],
  [/submissions\/CIK0001065088\.json/, () => jsonRes(JSON.parse(fixture("submissions-ebay.json")))],
  [/000000000026000030\/form4\.xml/, () => text(fixture("form4-multirow.xml"))],
  [/000000000026000025\/form4b\.xml/, () => text(fixture("form4-routine-f.xml"))],
  [/000000000026000028\/primary_doc\.xml/, () => text(fixture("sched13d-synthetic.xml"))],
  [/000000000026000029\/index\.json/, () => jsonRes(JSON.parse(fixture("folder-index-8k.json")))],
  [/0000000000-26-0000(27|40)\.txt/, () => text(fixture("sec-header-13d.txt"))],
  [/companyfacts/, () => jsonRes(JSON.parse(fixture("companyfacts-synthetic.json")))],
];
const newsRoutes: Route[] = [[/news\.google\.com\/rss\/search/, () => text(fixture("google-news.xml"))]];
const irRoutes: Route[] = [[/PressRelease\.svc/, () => jsonRes(JSON.parse(fixture("ir-feed.json")))]];
const NOW = Date.parse("2026-10-06T00:00:00Z");

beforeEach(() => {
  cache.clear();
  docCache.clear();
  resetSecLimiter();
  setSecIntervalForTests(0);
  resetXState();
  vi.unstubAllEnvs();
  for (const k of ["SEC_USER_AGENT", "X_BEARER_TOKEN", "MARKET_DATA_PROVIDER", "MARKET_DATA_API_KEY", "DASHBOARD_PASSWORD", "POSITION_JSON"]) vi.stubEnv(k, "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const byId = (f: Awaited<ReturnType<typeof buildFeed>>) => Object.fromEntries(f.sources.map((s) => [s.id, s])) as Record<"sec" | "ir" | "news" | "x" | "market", SourceHealth>;

describe("graceful degradation: every source failing independently", () => {
  it("everything down / unconfigured: /api/feed is still 200 with honest per-source health and no items", async () => {
    stubFetch([]);
    const res = await feedGET(new Request("http://t/api/feed"));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.items).toEqual([]);
    const h = Object.fromEntries((j.sources as { id: string; status: string; lastError?: string }[]).map((s) => [s.id, s])) as Record<"sec" | "ir" | "news" | "x" | "market", { id: string; status: string; lastError?: string }>;
    expect(h.sec.status).toBe("setup");
    expect(h.ir.status).toBe("error");
    expect(h.news.status).toBe("error");
    expect(h.x.status).toBe("setup");
    expect(h.x.lastError).toBe("X API NOT CONNECTED");
    expect(h.market.status).toBe("setup");
    expect(h.news.lastError).toContain("404");
  });

  it("SEC works, IR 5xx, News 5xx, X missing: only SEC items; others visible as errors", async () => {
    vi.stubEnv("SEC_USER_AGENT", "t t@example.com");
    stubFetch([...secRoutes, [/investor\.gamestop\.com/, () => text("boom", 503)], [/news\.google\.com/, () => text("boom", 503)]]);
    const f = await buildFeed({ nowMs: NOW });
    const h = byId(f);
    expect(h.sec.status).toBe("live");
    expect(h.ir.status).toBe("error");
    expect(h.ir.lastError).toContain("503");
    expect(h.news.status).toBe("error");
    expect(f.items.every((i) => i.sourceType === "sec" || i.sourceType === "ir")).toBe(true);
    expect(f.items.some((i) => i.sourceType === "sec")).toBe(true);
  }, 20000);

  it("News works while SEC is unconfigured and IR returns garbage", async () => {
    stubFetch([...newsRoutes, [/PressRelease\.svc/, () => text("<html>maintenance</html>")]]);
    const f = await buildFeed({ nowMs: NOW });
    const h = byId(f);
    expect(h.news.status).toBe("live");
    expect(h.news.note).toContain("4/4 queries ok");
    expect(h.sec.status).toBe("setup");
    expect(h.ir.status).toBe("error");
    expect(f.items.length).toBeGreaterThan(0);
    expect(f.items.every((i) => i.sourceType === "news")).toBe(true);
  });

  it("partial news failure (1 of 4 queries) stays live but is reported in the note", async () => {
    let n = 0;
    stubFetch([[/news\.google\.com/, () => (++n === 2 ? text("x", 500) : text(fixture("google-news.xml")))]]);
    const f = await buildFeed({ nowMs: NOW });
    expect(byId(f).news.status).toBe("live");
    expect(byId(f).news.note).toContain("3/4 queries ok");
  });

  it("IR payload with a wrong shape is an error, not '0 items'", async () => {
    stubFetch([[/PressRelease\.svc/, () => jsonRes({ unexpected: true })]]);
    const f = await buildFeed({ nowMs: NOW });
    expect(byId(f).ir.status).toBe("error");
    expect(byId(f).ir.lastError).toContain("unrecognised");
  });

  it("IR down ⇒ 8-K Ex. 99.1 fallback items labelled 'via SEC 8-K'", async () => {
    vi.stubEnv("SEC_USER_AGENT", "t t@example.com");
    stubFetch([...secRoutes]);
    const f = await buildFeed({ nowMs: NOW });
    expect(byId(f).ir.status).toBe("error");
    const fb = f.items.filter((i) => i.sourceType === "ir");
    expect(fb).toHaveLength(1);
    expect(fb[0]).toMatchObject({ source: "GameStop IR · via SEC 8-K", via: "via SEC 8-K", credibility: "official_company" });
    expect(fb[0]!.url).toMatch(/d1ex991\.htm$/);
  });

  it("IR healthy ⇒ no fallback items", async () => {
    vi.stubEnv("SEC_USER_AGENT", "t t@example.com");
    stubFetch([...secRoutes, ...irRoutes]);
    const f = await buildFeed({ nowMs: NOW });
    expect(byId(f).ir.status).toBe("live");
    expect(f.items.filter((i) => i.sourceType === "ir").every((i) => !i.via)).toBe(true);
  });

  it("a hanging request times out (8s) and is reported, without taking the page down", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_u: RequestInfo | URL, init?: RequestInit) => new Promise((_res, rej) => {
      init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
    })));
    const p = buildFeed({ nowMs: NOW });
    await vi.advanceTimersByTimeAsync(8_500);
    await vi.advanceTimersByTimeAsync(8_500);
    const f = await p;
    expect(byId(f).news.status).toBe("error");
    expect(byId(f).news.lastError).toContain("timeout after 8s");
  }, 20000);

  it("getText timeout surfaces as HttpError status 0", async () => {
    vi.stubGlobal("fetch", vi.fn((_u: RequestInfo | URL, init?: RequestInit) => new Promise((_res, rej) => {
      init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
    })));
    await expect(getText("https://x.test/", { timeoutMs: 30 })).rejects.toMatchObject({ status: 0, message: expect.stringContaining("timeout") });
    await expect(getText("https://x.test/", { timeoutMs: 30 })).rejects.toBeInstanceOf(HttpError);
  });
});

describe("routes", () => {
  it("all JSON routes answer 200 with their shape even when nothing is reachable", async () => {
    stubFetch([]);
    for (const [name, handler, key] of [
      ["sec", secGET, "health"], ["ir", irGET, "health"], ["news", newsGET, "health"], ["x", xGET, "health"], ["insiders", insidersGET, "health"], ["fundamentals", fundGET, "health"],
    ] as const) {
      const res = await handler(new Request(`http://t/api/${name}`));
      expect(res.status, name).toBe(200);
      const j = await res.json();
      expect(j[key], name).toBeTruthy();
      expect(res.headers.get("cache-control")).toContain("no-store");
    }
  });

  it("/api/health reports configuration as booleans only — never secret values", async () => {
    vi.stubEnv("SEC_USER_AGENT", "t t@example.com");
    vi.stubEnv("X_BEARER_TOKEN", "SECRET-TOKEN-VALUE-123");
    vi.stubEnv("DASHBOARD_PASSWORD", "SECRET-PASSWORD-456");
    vi.stubEnv("MARKET_DATA_API_KEY", "SECRET-MARKET-KEY-789");
    vi.stubEnv("MARKET_DATA_PROVIDER", "finnhub");
    vi.stubEnv("POSITION_JSON", '{"shares":{"Venue":777777},"warrants":{},"warrantDeadlines":{}}');
    stubFetch([]);
    const res = await healthGET();
    const body = await res.text();
    expect(body).not.toMatch(/SECRET-/);
    expect(body).not.toContain("777777");
    const j = JSON.parse(body);
    expect(j.config).toEqual({ secUserAgent: true, xBearerToken: true, marketData: true, dashboardPassword: true, positionJson: true });
  });

  it("/api/feed with SEC + News + IR returns merged, newest-first, deduped items with scores and reasons", async () => {
    vi.stubEnv("SEC_USER_AGENT", "t t@example.com");
    stubFetch([...secRoutes, ...newsRoutes, ...irRoutes]);
    const res = await feedGET(new Request("http://t/api/feed"));
    const j = await res.json();
    expect(j.sources.map((s: { id: string }) => s.id)).toEqual(["sec", "ir", "news", "x", "market"]);
    const times = j.items.map((i: { publishedAt: string }) => Date.parse(i.publishedAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(j.items.every((i: { scoreReasons: string[]; url: string }) => i.scoreReasons.length > 0 && /^https?:\/\//.test(i.url))).toBe(true);
    expect(new Set(j.items.map((i: { id: string }) => i.id)).size).toBe(j.items.length);
    expect(j.xConnected).toBe(false);
  });

  it("/api/insiders exposes parsed Form 4 rows and 13D rows with sources", async () => {
    vi.stubEnv("SEC_USER_AGENT", "t t@example.com");
    stubFetch(secRoutes);
    const j = await (await insidersGET(new Request("http://t/api/insiders"))).json();
    const rc = j.filings.find((f: { accession: string }) => f.accession === "0000000000-26-000030");
    expect(rc.txns).toHaveLength(2);
    expect(rc.txns[0]).toMatchObject({ code: "P", shares: 200000, pricePerShare: 20 });
    expect(rc.indexUrl).toContain("-index.htm");
    expect(j.sched13[0].parse.persons[0].percentOfClass).toBe(0.3);
  });
});

describe("irFallbackFromSec", () => {
  it("only 8-Ks that have an Ex. 99.1 link", () => {
    expect(irFallbackFromSec([], "now")).toEqual([]);
  });
});
