import { describe, expect, it } from "vitest";
import { laneCountFor, laneDuration, pickDrift, shorten, toLanes } from "@/lib/drift";
import type { WireItem } from "@/lib/types";

const NOW = Date.parse("2026-10-07T00:00:00Z");
const mk = (id: string, hoursAgo: number, score: number): WireItem => ({
  id, sourceType: "news", source: "S", credibility: "reporting", title: id, publishedAt: new Date(NOW - hoursAgo * 3_600_000).toISOString(), fetchedAt: "x",
  url: "https://e.test/" + id, people: [], tags: [], score, signal: score >= 85 ? "high" : "medium", scoreReasons: [],
});

describe("news drift selection", () => {
  it("only real items inside the window; nothing invented; empty before mount (now = 0)", () => {
    expect(pickDrift([], NOW)).toEqual([]);
    expect(pickDrift([mk("a", 1, 50)], 0)).toEqual([]);
    const out = pickDrift([mk("old", 100, 99), mk("future", -2, 99), mk("ok", 2, 50)], NOW);
    expect(out.map((i) => i.id)).toEqual(["ok"]);
  });
  it("ranks by score with a recency penalty, then lists newest first", () => {
    const items = [mk("stale-high", 70, 95), mk("fresh-med", 1, 70), mk("fresh-low", 1, 30)];
    const out = pickDrift(items, NOW, { max: 2 });
    expect(out.map((i) => i.id)).toEqual(["fresh-med", "stale-high"]); // low is cut; newest first
  });
  it("caps at max", () => {
    const items = Array.from({ length: 50 }, (_, i) => mk(`n${i}`, i / 2, 60));
    expect(pickDrift(items, NOW, { max: 30 })).toHaveLength(30);
  });
  it("lane count and round-robin distribution", () => {
    expect([0, 1, 3, 4, 9, 10, 40].map(laneCountFor)).toEqual([0, 1, 1, 2, 2, 3, 3]);
    const lanes = toLanes(["a", "b", "c", "d", "e"].map((x) => mk(x, 1, 50)), 2);
    expect(lanes.map((l) => l.map((i) => i.id))).toEqual([["a", "c", "e"], ["b", "d"]]);
    expect(laneDuration(2)).toBe(45);
    expect(laneDuration(10)).toBe(90);
  });
  it("shortens long titles without cutting short ones", () => {
    expect(shorten("short")).toBe("short");
    expect(shorten("x".repeat(200)).length).toBe(84);
    expect(shorten("x".repeat(200)).endsWith("…")).toBe(true);
  });
});
