import { describe, expect, it } from "vitest";
import { buildMa, isMaItem, laneOf, maRegex } from "@/lib/ma";
import type { WireItem } from "@/lib/types";

const mk = (o: Partial<WireItem>): WireItem => ({
  id: Math.random().toString(36), sourceType: "news", source: "S", credibility: "reporting", title: "t", publishedAt: "2026-10-05T10:00:00.000Z", fetchedAt: "x", url: "https://e.test/" + Math.random(), people: [], tags: [], score: 50, signal: "low", scoreReasons: [], ...o,
});

describe("M&A lanes (strictly by source)", () => {
  it("lane assignment", () => {
    expect(laneOf(mk({ sourceType: "sec" }))).toBe("confirmed");
    expect(laneOf(mk({ sourceType: "ir" }))).toBe("confirmed");
    expect(laneOf(mk({ sourceType: "x", handle: "gamestop" }))).toBe("confirmed");
    expect(laneOf(mk({ sourceType: "x", handle: "ryancohen" }))).toBe("confirmed");
    expect(laneOf(mk({ sourceType: "x", handle: "larryvc" }))).toBe("rumour");
    expect(laneOf(mk({ newsTier: "t1" }))).toBe("reporting");
    expect(laneOf(mk({ newsTier: "t2" }))).toBe("reporting");
    expect(laneOf(mk({ newsTier: "t3" }))).toBe("rumour");
    expect(laneOf(mk({ newsTier: "opinion" }))).toBe("rumour");
    expect(laneOf(mk({ newsTier: undefined }))).toBe("rumour");
  });
  it("keywords never move an item between lanes (a T3 'confirmed deal' stays a rumour)", () => {
    const m = buildMa([mk({ title: "Confirmed: GameStop to acquire eBay, officially announced", newsTier: "t3" })], ["eBay Inc."]);
    expect(m.rumour).toHaveLength(1);
    expect(m.confirmed).toHaveLength(0);
  });
  it("official X posts about M&A are tagged OFFICIAL STATEMENT; unrelated posts are not on the page", () => {
    const m = buildMa([mk({ sourceType: "x", handle: "ryancohen", title: "eBay is a great business" }), mk({ sourceType: "x", handle: "ryancohen", title: "hello world" })], ["eBay Inc."]);
    expect(m.confirmed).toHaveLength(1);
    expect(m.confirmed[0]!.officialStatement).toBe(true);
    expect(m.timeline).toHaveLength(0); // statements are not dated filings
  });
  it("adding another counterparty just works", () => {
    const re = maRegex(["eBay Inc.", "Acme Corp."]);
    expect(re.test("GameStop eyes Acme")).toBe(true);
    expect(maRegex(["eBay Inc."]).test("GameStop eyes Acme")).toBe(false);
  });
  it("SEC items: tender/425 forms, M&A-tagged, and counterparty subject/filer qualify; ordinary filings don't", () => {
    const re = maRegex(["eBay"]);
    expect(isMaItem(mk({ sourceType: "sec", form: "425", title: "425" }), re)).toBe(true);
    expect(isMaItem(mk({ sourceType: "sec", form: "4", title: "FORM 4" }), re)).toBe(false);
    expect(isMaItem(mk({ sourceType: "sec", form: "SCHEDULE 13D/A", tags: ["M&A"] }), re)).toBe(true);
    expect(isMaItem(mk({ sourceType: "sec", form: "8-K", subject: { name: "eBay", cik: "0001065088" } }), re, ["0001065088"])).toBe(true);
  });
  it("timeline is the confirmed SEC/IR events, oldest first", () => {
    const a = mk({ sourceType: "sec", form: "425", title: "A", publishedAt: "2026-06-01T00:00:00.000Z" });
    const b = mk({ sourceType: "ir", title: "GameStop proposal to acquire eBay", publishedAt: "2026-05-03T00:00:00.000Z" });
    expect(buildMa([a, b], ["eBay"]).timeline.map((x) => x.title)).toEqual(["GameStop proposal to acquire eBay", "A"]);
  });
});
