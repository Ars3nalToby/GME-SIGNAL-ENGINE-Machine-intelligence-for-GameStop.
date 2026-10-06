// Not a real test: when VISUAL_FEED_OUT is set it dumps a fixture-built feed JSON so Playwright can
// review layouts with populated data (via request interception only — never wired into the app).
import { describe, it, vi } from "vitest";
import fs from "node:fs";
import { cache } from "@/lib/cache";
import { docCache } from "@/lib/sources/sec";
import { resetSecLimiter, setSecIntervalForTests } from "@/lib/http";
import { buildFeed } from "@/lib/feed";
import { fixture, jsonRes, stubFetch, text } from "./helpers";

const out = process.env.VISUAL_FEED_OUT;
describe.skipIf(!out)("visual feed dump", () => {
  it("writes the feed", async () => {
    cache.clear(); docCache.clear(); resetSecLimiter(); setSecIntervalForTests(0);
    vi.stubEnv("SEC_USER_AGENT", "t t@example.com");
    stubFetch([
      [/company_tickers\.json/, () => jsonRes(JSON.parse(fixture("company-tickers.json")))],
      [/submissions\/CIK0001326380\.json/, () => jsonRes(JSON.parse(fixture("submissions-gme.json")))],
      [/submissions\/CIK0001065088\.json/, () => jsonRes(JSON.parse(fixture("submissions-ebay.json")))],
      [/000000000026000030\/form4\.xml/, () => text(fixture("form4-multirow.xml"))],
      [/000000000026000025\/form4b\.xml/, () => text(fixture("form4-routine-f.xml"))],
      [/000000000026000028\/primary_doc\.xml/, () => text(fixture("sched13d-synthetic.xml"))],
      [/000000000026000029\/index\.json/, () => jsonRes(JSON.parse(fixture("folder-index-8k.json")))],
      [/0000000000-26-0000(27|40)\.txt/, () => text(fixture("sec-header-13d.txt"))],
      [/news\.google\.com/, () => text(fixture("google-news.xml"))],
      [/PressRelease\.svc/, () => jsonRes(JSON.parse(fixture("ir-feed.json")))],
    ]);
    // make "now" just after the newest fixture filing so relative ages look natural
    const f = await buildFeed({ nowMs: Date.parse("2026-10-06T00:30:00Z") });
    const now = Date.now();
    const shift = now - Date.parse("2026-10-06T00:30:00Z");
    const items = f.items.map((i) => ({ ...i, publishedAt: new Date(Date.parse(i.publishedAt) + shift).toISOString() }));
    fs.writeFileSync(out!, JSON.stringify({ ...f, items, secBundle: undefined, irPages: undefined }));
  });
});
