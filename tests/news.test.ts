import { describe, expect, it } from "vitest";
import { fixture } from "./helpers";
import { normalizeNews, parseGoogleNewsRss } from "@/lib/sources/news";
import { dedupe } from "@/lib/dedupe";
import { tierOf } from "@/lib/config/publishers";

const NOW = "2026-10-05T12:00:00.000Z";

describe("publisher tiers", () => {
  it("maps the SPEC list; unknown = T3", () => {
    expect(tierOf("Reuters")).toBe("t1");
    expect(tierOf("The Wall Street Journal")).toBe("t1");
    expect(tierOf("AP")).toBe("t1");
    expect(tierOf("Axios")).toBe("t2");
    expect(tierOf("Business Wire")).toBe("t2");
    expect(tierOf("Yahoo Finance")).toBe("t3");
    expect(tierOf("The Motley Fool")).toBe("opinion");
    expect(tierOf("Seeking Alpha")).toBe("opinion");
    expect(tierOf("Some Local Blog")).toBe("t3");
    expect(tierOf(undefined)).toBe("t3");
  });
});

describe("Google News RSS (synthetic fixture)", () => {
  const raw = parseGoogleNewsRss(fixture("google-news.xml"));
  const items = normalizeNews(raw, NOW);

  it("parses every <item>; rejects non-RSS", () => {
    expect(raw).toHaveLength(5);
    expect(() => parseGoogleNewsRss("<html></html>")).toThrow();
  });
  it("strips ' - Publisher', uses <source>, keeps the Google redirect link, labels 'via Google News'", () => {
    const r = items.find((i) => i.outlet === "Reuters")!;
    expect(r.title).toBe("Exclusive: GameStop plans to acquire eBay, people familiar say");
    expect(r.source).toBe("Reuters · via Google News");
    expect(r.url).toMatch(/^https:\/\/news\.google\.com\/rss\/articles\//);
    expect(r.via).toBe("via Google News");
    expect(r.credibility).toBe("reporting_tier1");
    expect(r.id).toMatch(/^news:/);
  });
  it("drops items that don't mention GameStop/GME/Ryan Cohen/Larry Cheng, and items without a valid date", () => {
    expect(items.map((i) => i.outlet)).not.toContain("Some Paper");
    expect(items.map((i) => i.outlet)).not.toContain("Unknown Gazette");
    expect(items).toHaveLength(3);
  });
  it("T1 exclusive on an acquisition is HIGH; the syndicated T3 copy is not; opinion is capped and penalised", () => {
    const r = items.find((i) => i.outlet === "Reuters")!;
    const y = items.find((i) => i.outlet === "Yahoo Finance")!;
    const f = items.find((i) => i.outlet === "The Motley Fool")!;
    expect(r.signal).toBe("high");
    expect(y.signal).not.toBe("high");
    expect(y.score).toBeLessThanOrEqual(74);
    expect(f.credibility).toBe("opinion");
    expect(f.score).toBeLessThanOrEqual(49);
    expect(f.scoreReasons.join(" ")).toContain("−12");
  });
  it("rumour language never upgrades credibility", () => {
    const y = items.find((i) => i.outlet === "Yahoo Finance")!;
    expect(y.credibility).toBe("reporting");
  });
  it("syndicated copies cluster under the highest-scoring representative", () => {
    const out = dedupe(items);
    const rep = out.find((i) => i.outlet === "Reuters")!;
    expect(rep.cluster).toEqual({ count: 1, outlets: ["Yahoo Finance"] });
    expect(out.find((i) => i.outlet === "Yahoo Finance")).toBeUndefined();
  });
});
