import { describe, expect, it } from "vitest";
import { dedupe } from "@/lib/dedupe";
import { jaccard, normalizeTitle, tokenSet } from "@/lib/normalize";
import type { WireItem } from "@/lib/types";

const base = (o: Partial<WireItem>): WireItem => ({
  id: "x", sourceType: "news", source: "S", credibility: "reporting", title: "t", publishedAt: "2026-10-05T10:00:00.000Z", fetchedAt: "2026-10-05T10:00:00.000Z",
  url: "https://e.test/a", people: [], tags: [], score: 50, signal: "low", scoreReasons: [], newsTier: "t3", outlet: "Out", ...o,
});

describe("normalize", () => {
  it("strips publisher suffix and punctuation", () => {
    expect(normalizeTitle("GameStop's  Big Deal! - Reuters", "Reuters")).toBe("gamestop s big deal");
  });
  it("jaccard", () => {
    expect(jaccard(tokenSet("alpha beta gamma delta"), tokenSet("alpha beta gamma epsilon"))).toBeCloseTo(3 / 5);
    expect(jaccard(new Set(), tokenSet("alpha"))).toBe(0);
  });
});

describe("dedupe & clustering", () => {
  it("same URL collapses; keeps the higher-scoring representative", () => {
    const out = dedupe([base({ id: "1", url: "https://e.test/a", score: 40 }), base({ id: "2", url: "https://e.test/a/", score: 60, title: "different words entirely here" })]);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("2");
  });

  it("near-duplicate titles (Jaccard ≥ 0.75, ≤ 48h) cluster with +N outlets; rep = score, then tier, then earliest", () => {
    const a = base({ id: "a", title: "GameStop plans to acquire eBay in huge deal", url: "https://e.test/1", outlet: "Reuters", newsTier: "t1", score: 85 });
    const b = base({ id: "b", title: "GameStop plans to acquire eBay in huge deal today", url: "https://e.test/2", outlet: "Yahoo", newsTier: "t3", score: 46, publishedAt: "2026-10-05T12:00:00.000Z" });
    const c = base({ id: "c", title: "Totally unrelated headline about earnings", url: "https://e.test/3" });
    const out = dedupe([b, a, c]);
    expect(out).toHaveLength(2);
    const rep = out.find((i) => i.id === "a")!;
    expect(rep.cluster).toEqual({ count: 1, outlets: ["Yahoo"] });
    expect(rep.alsoReportedBy?.[0]?.url).toBe("https://e.test/2");
  });

  it("does not cluster across > 48h", () => {
    const a = base({ id: "a", title: "GameStop plans to acquire eBay in huge deal", url: "https://e.test/1" });
    const b = base({ id: "b", title: "GameStop plans to acquire eBay in huge deal", url: "https://e.test/2", publishedAt: "2026-10-09T10:00:00.000Z" });
    expect(dedupe([a, b])).toHaveLength(2);
  });

  it("news matching an IR release (≥ 0.8, ≤ 24h) folds into the IR item as 'also reported by'", () => {
    const ir = base({ id: "ir1", sourceType: "ir", source: "GameStop IR", title: "GameStop Announces Quarterly Results", url: "https://investor.gamestop.com/r", score: 90, outlet: undefined, newsTier: undefined });
    const n = base({ id: "n1", title: "GameStop Announces Quarterly Results", url: "https://news.test/x", outlet: "Benzinga" });
    const out = dedupe([ir, n]);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("ir1");
    expect(out[0]!.alsoReportedBy).toEqual([{ outlet: "Benzinga", url: "https://news.test/x" }]);
  });

  it("guarantees unique ids in the output", () => {
    const a = base({ id: "x:1", sourceType: "x", url: "https://x.com/a/status/1", title: "same post" });
    const b = base({ id: "x:1", sourceType: "x", url: "https://x.com/b/status/1", title: "same post" });
    expect(new Set(dedupe([a, b]).map((i) => i.id)).size).toBe(dedupe([a, b]).length);
  });

  it("never merges SEC filings with equal titles and sorts newest first", () => {
    const s1 = base({ id: "sec:1", sourceType: "sec", title: "FORM 4", url: "https://sec.test/1", publishedAt: "2026-10-05T10:00:00.000Z" });
    const s2 = base({ id: "sec:2", sourceType: "sec", title: "FORM 4", url: "https://sec.test/2", publishedAt: "2026-10-05T11:00:00.000Z" });
    expect(dedupe([s1, s2]).map((i) => i.id)).toEqual(["sec:2", "sec:1"]);
  });
});
