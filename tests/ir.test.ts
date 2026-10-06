import { describe, expect, it } from "vitest";
import { fixture } from "./helpers";
import { discoverFeedUrls, irEntryToItem, parseIrFeed, parseIrPage } from "@/lib/sources/ir";

describe("IR feed (synthetic Q4-shaped fixture)", () => {
  it("parses headline, absolute link, Eastern date and text-only summary", () => {
    const e = parseIrFeed(JSON.parse(fixture("ir-feed.json")));
    expect(e).toHaveLength(2);
    expect(e[0]).toMatchObject({
      title: "GameStop Announces Synthetic Quarterly Results",
      url: "https://investor.gamestop.com/news-releases/news-release-details/synthetic-quarterly-results",
      date: "2026-09-10T20:05:00.000Z",
      summary: "Synthetic summary & text.",
    });
  });
  it("unrecognised shapes are an error, never '0 items'", () => {
    expect(() => parseIrFeed({ hello: "world" })).toThrow(/unrecognised/);
    expect(() => parseIrFeed({ GetPressReleaseListResult: [{ nothing: 1 }] })).toThrow();
  });
  it("items are official_company, scored IR, linked to investor.gamestop.com", () => {
    const [e] = parseIrFeed(JSON.parse(fixture("ir-feed.json")));
    const it = irEntryToItem(e!, "2026-10-05T00:00:00.000Z")!;
    expect(it).toMatchObject({ sourceType: "ir", credibility: "official_company", source: "GameStop IR" });
    expect(it.score).toBeGreaterThanOrEqual(86);
    expect(it.url).toContain("investor.gamestop.com");
    expect(irEntryToItem({ title: "undated", url: "https://x.test/a", kind: "news" }, "now")).toBeUndefined();
  });
  it("discovers /feed/*.svc endpoints in page/script text", () => {
    const urls = discoverFeedUrls(fixture("ir-ebay-page.html"));
    expect(urls[0]).toContain("https://investor.gamestop.com/feed/PressRelease.svc/GetPressReleaseList");
  });
});

describe("IR server-rendered page (synthetic markup)", () => {
  const e = parseIrPage(fixture("ir-ebay-page.html"), "https://investor.gamestop.com/eBay/default.aspx");
  it("extracts news / documents / filings with dates; ignores nav, footer, generic and javascript: links", () => {
    expect(e.map((x) => x.kind).sort()).toEqual(["document", "filing", "news", "news"]);
    const may = e.find((x) => x.title.includes("Proposal"))!;
    expect(may.date).toBe("2026-05-03T04:00:00.000Z");
    expect(e.find((x) => x.title.includes("Privacy"))).toBeUndefined();
    expect(e.find((x) => x.title.includes("Home page"))).toBeUndefined();
    expect(e.find((x) => x.url.startsWith("javascript"))).toBeUndefined();
    expect(e.find((x) => x.title === "Read more")).toBeUndefined();
  });
  it("document links resolve against the page", () => {
    expect(e.find((x) => x.kind === "document")!.url).toBe("https://investor.gamestop.com/static-files/abc-synthetic.pdf");
  });
});
