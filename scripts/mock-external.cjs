/* eslint-disable @typescript-eslint/no-require-imports */
// VERIFICATION TOOLING ONLY. Preload with NODE_OPTIONS="--require ./scripts/mock-external.cjs" to run the real
// server against the SYNTHETIC fixtures in tests/fixtures instead of the (here unreachable) external hosts.
// Never part of the app, never a UI fallback.
const fs = require("node:fs");
const path = require("node:path");
const fx = (n) => fs.readFileSync(path.join(__dirname, "..", "tests", "fixtures", n), "utf8");
const json = (b, s = 200) => new Response(typeof b === "string" ? b : JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const text = (b, s = 200) => new Response(b, { status: s });
const real = globalThis.fetch;
const routes = [
  [/company_tickers\.json/, () => json(fx("company-tickers.json"))],
  [/submissions\/CIK0001326380\.json/, () => json(fx("submissions-gme.json"))],
  [/submissions\/CIK0001065088\.json/, () => json(fx("submissions-ebay.json"))],
  [/000000000026000030\/form4\.xml/, () => text(fx("form4-multirow.xml"))],
  [/000000000026000025\/form4b\.xml/, () => text(fx("form4-routine-f.xml"))],
  [/000000000026000028\/primary_doc\.xml/, () => text(fx("sched13d-synthetic.xml"))],
  [/000000000026000029\/index\.json/, () => json(fx("folder-index-8k.json"))],
  [/0000000000-26-0000(27|40)\.txt/, () => text(fx("sec-header-13d.txt"))],
  [/companyfacts/, () => json(fx("companyfacts-synthetic.json"))],
  [/news\.google\.com/, () => text(fx("google-news.xml"))],
  [/PressRelease\.svc/, () => json(fx("ir-feed.json"))],
  [/investor\.gamestop\.com\/(eBay|warrant-dividend|newsroom)/i, () => text(fx("ir-ebay-page.html"))],
  [/api\.x\.com\/2\/users\/by/, () => json(fx("x-users.json"))],
  [/api\.x\.com\/2\/users\/\d+\/tweets/, () => {
    const now = Date.now();
    const j = JSON.parse(fx("x-posts.json"));
    j.data[0].created_at = new Date(now - 3600e3).toISOString();
    j.data[1].created_at = new Date(now - 7200e3).toISOString();
    j.data[2].created_at = new Date(now - 9000e3).toISOString();
    return json(j);
  }],
  [/finnhub\.io/, () => json({ c: 25.5, d: 1, dp: 4, t: Math.floor(Date.now() / 1000) })],
];
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) return real(input, init);
  for (const [re, h] of routes) if (re.test(url)) return h(url);
  return new Response("not found (mock)", { status: 404 });
};
