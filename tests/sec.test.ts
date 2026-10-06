import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cache } from "@/lib/cache";
import { getEnv } from "@/lib/config/env";
import { resetSecLimiter, setSecIntervalForTests } from "@/lib/http";
import { buildSecBundle, docCache, findEx99, loadSec, parseSubmissions, resolveRowTimes } from "@/lib/sources/sec";
import { fixture, jsonRes, stubFetch, text, type Route } from "./helpers";

const NOW_MS = Date.parse("2026-10-06T00:00:00Z");

const routes = (extra: Route[] = []): Route[] => [
  [/company_tickers\.json/, () => jsonRes(JSON.parse(fixture("company-tickers.json")))],
  [/submissions\/CIK0001326380\.json/, () => jsonRes(JSON.parse(fixture("submissions-gme.json")))],
  [/submissions\/CIK0001065088\.json/, () => jsonRes(JSON.parse(fixture("submissions-ebay.json")))],
  [/000000000026000030\/form4\.xml/, () => text(fixture("form4-multirow.xml"))],
  [/000000000026000025\/form4b\.xml/, () => text(fixture("form4-routine-f.xml"))],
  [/000000000026000028\/primary_doc\.xml/, () => text(fixture("sched13d-synthetic.xml"))],
  [/000000000026000029\/index\.json/, () => jsonRes(JSON.parse(fixture("folder-index-8k.json")))],
  [/0000000000-26-000027\.txt/, () => text(fixture("sec-header-13d.txt"))],
  [/0000000000-26-000040\.txt/, () => text(fixture("sec-header-13d.txt"))],
  ...extra,
];

beforeEach(() => {
  cache.clear();
  docCache.clear();
  resetSecLimiter();
  setSecIntervalForTests(0);
  vi.stubEnv("SEC_USER_AGENT", "GME Live Wire tests test@example.com");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("submissions parsing", () => {
  it("columnar recent → rows", () => {
    const { rows, name } = parseSubmissions(JSON.parse(fixture("submissions-gme.json")), "1326380");
    expect(name).toBe("GameStop Corp.");
    expect(rows).toHaveLength(7);
    expect(rows[1]).toMatchObject({ accession: "0000000000-26-000029", form: "8-K", items: ["2.02", "9.01"] });
    expect(rows[0]!.listCik).toBe("0001326380");
  });
  it("rejects payloads of the wrong shape (zod)", () => {
    expect(() => parseSubmissions({ filings: {} }, "1")).toThrow();
  });
  it("a stamp that is in the future under one reading flips to the other; future under both is clamped to now; undated rows use filingDate", () => {
    const row = (acceptanceRaw?: string) => ({ listCik: "1", listName: "", accession: "a", form: "4", filingDate: "2026-10-05", acceptanceRaw, items: [] });
    const now = Date.parse("2026-10-06T00:00:00Z");
    // Eastern reading (22:00 EDT = 02:00Z next day) is in the future; the UTC reading is plausible
    expect(resolveRowTimes([row("2026-10-05T22:00:00.000Z")], "America/New_York", now).rows[0]!.publishedAt).toBe("2026-10-05T22:00:00.000Z");
    // future under both readings
    expect(resolveRowTimes([row("2026-10-06T03:00:00.000Z")], "UTC", now).rows[0]!.publishedAt).toBe("2026-10-06T00:00:00.000Z");
    expect(resolveRowTimes([row()], "UTC", now).rows[0]!.publishedAt).toBe("2026-10-05T16:00:00.000Z");
  });
  it("Ex. 99.1 detection from index.json", () => {
    const ex = findEx99(JSON.parse(fixture("folder-index-8k.json")), { listCik: "0001326380", accession: "0000000000-26-000029" });
    expect(ex?.name).toBe("d1ex991.htm");
    expect(ex?.url).toBe("https://www.sec.gov/Archives/edgar/data/1326380/000000000026000029/d1ex991.htm");
  });
});

describe("SEC pipeline (stubbed HTTP, synthetic fixtures)", () => {
  it("builds titled, scored, linked items; resolves direction (filer vs subject)", async () => {
    const calls = stubFetch(routes());
    const b = await buildSecBundle(getEnv(), NOW_MS, false);
    const by = (acc: string) => b.items.find((i) => i.id === `sec:${acc}`)!;

    const f4 = by("0000000000-26-000030");
    expect(f4.title).toBe("FORM 4 · Ryan Cohen · PURCHASE 500,000 sh @ avg $20.90");
    expect(f4.score).toBe(98);
    expect(f4.signal).toBe("high");
    expect(f4.people).toEqual(["ryan_cohen"]);
    expect(f4.insiderClass).toBe("purchase");
    expect(f4.url).toBe("https://www.sec.gov/Archives/edgar/data/1326380/000000000026000030/xslF345X05/form4.xml");
    expect(f4.altLinks?.map((l) => l.label)).toEqual(["Filing index", "Raw XML"]);
    expect(f4.altLinks?.[1]?.url).toBe("https://www.sec.gov/Archives/edgar/data/1326380/000000000026000030/form4.xml");

    const k8 = by("0000000000-26-000029");
    expect(k8.title).toBe("8-K · 2.02 Results of Operations · 9.01 Exhibits");
    expect(k8.score).toBe(92);
    expect(k8.altLinks?.some((l) => l.label === "Press release (Ex. 99.1)" && l.url.endsWith("d1ex991.htm"))).toBe(true);

    const d = by("0000000000-26-000028");
    expect(d.title).toBe("SCHEDULE 13D/A — Ryan Cohen's stake in GameStop");
    expect(d.score).toBe(96);
    expect(d.summary).toContain("1,300,000 sh");
    expect(d.summary).toContain("not the same as shares owned");

    const c425 = by("0000000000-26-000027");
    expect(c425.title).toBe("425 — Business-combination communication: GameStop re eBay Inc.");
    expect(c425.filer?.name).toBe("GameStop");
    expect(c425.subject?.name).toBe("eBay Inc.");
    expect(c425.score).toBe(95);

    expect(by("0000000000-26-000026").score).toBe(88); // 10-Q
    expect(by("0000000000-26-000025").title).toBe("FORM 4 · Roe Richard · routine (grant / tax withholding)");
    expect(by("0000000000-26-000025").score).toBe(62);

    // watched counterparty (eBay) 14D9 is included; its 10-Q is not (M&A forms only)
    expect(b.items.some((i) => i.id === "sec:0000000000-26-000040")).toBe(true);
    expect(b.items.some((i) => i.id === "sec:0000000000-26-000039")).toBe(false);

    // all SEC requests carry the User-Agent via fetch headers
    expect(calls.length).toBeGreaterThan(5);
    expect(b.zone).toBe("America/New_York"); // 09:45 stamp is only plausible as Eastern wall clock
  });

  it("13G with no parseable direction is labelled UNPARSED, never guessed", async () => {
    stubFetch(routes());
    const b = await buildSecBundle(getEnv(), NOW_MS, false);
    const g = b.items.find((i) => i.id === "sec:0000000000-26-000024")!;
    expect(g.title).toContain("UNPARSED — open filing");
    expect(g.score).toBe(62);
  });

  it("sends the configured User-Agent on every SEC request", async () => {
    const uas: (string | undefined)[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      uas.push((init?.headers as Record<string, string>)["user-agent"]);
      const url = String(input);
      for (const [re, h] of routes()) if (re.test(url)) return (await h(url))!;
      return text("nf", 404);
    }));
    await buildSecBundle(getEnv(), NOW_MS, false);
    expect(uas.length).toBeGreaterThan(0);
    expect(new Set(uas)).toEqual(new Set(["GME Live Wire tests test@example.com"]));
  });

  it("parses at most 10 uncached filing documents per refresh cycle, newest first; the rest fill in later", async () => {
    const n = 14;
    const sub = {
      name: "GameStop Corp.",
      filings: {
        recent: {
          accessionNumber: Array.from({ length: n }, (_, i) => `0000000000-26-0001${String(n - i).padStart(2, "0")}`),
          form: Array(n).fill("4"),
          filingDate: Array(n).fill("2026-10-05"),
          acceptanceDateTime: Array.from({ length: n }, (_, i) => `2026-10-05T${String(20 - Math.floor(i / 2)).padStart(2, "0")}:${String(59 - i).padStart(2, "0")}:00.000Z`),
          items: Array(n).fill(""),
          primaryDocument: Array.from({ length: n }, (_, i) => `xslF345X05/f${n - i}.xml`),
          primaryDocDescription: Array(n).fill("FORM 4"),
          reportDate: Array(n).fill(""),
        },
      },
    };
    const calls = stubFetch([
      [/company_tickers\.json/, () => jsonRes(JSON.parse(fixture("company-tickers.json")))],
      [/submissions\/CIK0001326380\.json/, () => jsonRes(sub)],
      [/submissions\/CIK0001065088\.json/, () => jsonRes({ name: "EBAY INC", filings: { recent: { accessionNumber: [], form: [], filingDate: [] } } })],
      [/\/f\d+\.xml$/, () => text(fixture("form4-routine-f.xml"))],
    ]);
    const first = await buildSecBundle(getEnv(), NOW_MS, false);
    expect(calls.filter((u) => /\/f\d+\.xml$/.test(u))).toHaveLength(10);
    expect(first.stats).toMatchObject({ attempted: 10, pending: 4 });
    expect(first.items.filter((i) => i.parseNote === "pending")).toHaveLength(4);
    // the 10 newest got parsed
    expect(first.items.slice(0, 10).every((i) => i.parseNote !== "pending")).toBe(true);

    cache.clear(); // next refresh cycle
    const second = await buildSecBundle(getEnv(), NOW_MS + 61_000, false);
    expect(calls.filter((u) => /\/f\d+\.xml$/.test(u))).toHaveLength(14); // only the 4 missing were fetched
    expect(second.stats.pending).toBe(0);
    expect(second.items.filter((i) => i.parseNote === "pending")).toHaveLength(0);
  });
});

describe("loadSec health", () => {
  it("missing SEC_USER_AGENT → setup, no requests", async () => {
    vi.stubEnv("SEC_USER_AGENT", "");
    const calls = stubFetch(routes());
    const r = await loadSec({ nowMs: NOW_MS });
    expect(r.health.status).toBe("setup");
    expect(r.health.lastError).toContain("SEC_USER_AGENT");
    expect(calls).toHaveLength(0);
  });
  it("403 surfaces clearly (User-Agent hint) as error", async () => {
    stubFetch([[/submissions/, () => text("denied", 403)]]);
    const r = await loadSec({ nowMs: NOW_MS });
    expect(r.health.status).toBe("error");
    expect(r.health.lastError).toContain("403");
    expect(r.health.lastError).toContain("SEC_USER_AGENT");
  });
  it("live then stale-on-error ⇒ degraded, still serving the last good items", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW_MS);
    stubFetch(routes());
    const ok = await loadSec({ nowMs: NOW_MS });
    expect(ok.health.status).toBe("live");
    expect(ok.items.length).toBeGreaterThan(5);
    vi.setSystemTime(NOW_MS + 5 * 60_000);
    stubFetch([[/./, () => text("down", 400)]]);
    const stale = await loadSec({ nowMs: NOW_MS + 5 * 60_000 });
    vi.useRealTimers();
    expect(stale.health.status).toBe("degraded");
    expect(stale.health.lastError).toContain("400");
    expect(stale.items.length).toBe(ok.items.length);
    expect(stale.health.lastSuccessAt).toBe(new Date(NOW_MS).toISOString());
  });
});
