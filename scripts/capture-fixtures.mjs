// Run from a machine with access to sec.gov / news.google.com / investor.gamestop.com to capture REAL fixtures
// into tests/fixtures/real/.  SEC_USER_AGENT="Your Name you@example.com" node scripts/capture-fixtures.mjs
import fs from "node:fs";
import path from "node:path";

const ua = process.env.SEC_USER_AGENT;
if (!ua) {
  console.error("Set SEC_USER_AGENT to something like 'Your Name you@example.com'.");
  process.exit(2);
}
const out = path.resolve("tests/fixtures/real");
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (url, name, headers = {}, trim) => {
  await sleep(250);
  const res = await fetch(url, { headers: { "user-agent": ua, accept: "*/*", ...headers } });
  console.log(res.status, url);
  if (!res.ok) return null;
  let body = await res.text();
  if (trim) body = trim(body);
  fs.writeFileSync(path.join(out, name), body);
  return body;
};

const subs = await get("https://data.sec.gov/submissions/CIK0001326380.json", "submissions-gme.json", {}, (t) => {
  const j = JSON.parse(t);
  for (const k of Object.keys(j.filings.recent)) j.filings.recent[k] = j.filings.recent[k].slice(0, 80);
  j.filings.files = [];
  return JSON.stringify(j, null, 1);
});
await get("https://data.sec.gov/submissions/CIK0001065088.json", "submissions-ebay.json", {}, (t) => {
  const j = JSON.parse(t);
  for (const k of Object.keys(j.filings.recent)) j.filings.recent[k] = j.filings.recent[k].slice(0, 40);
  j.filings.files = [];
  return JSON.stringify(j, null, 1);
});
await get("https://www.sec.gov/files/company_tickers.json", "company-tickers.json", {}, (t) => {
  const j = JSON.parse(t);
  return JSON.stringify(Object.fromEntries(Object.entries(j).filter(([, v]) => ["GME", "EBAY"].includes(v.ticker))));
});
// the two reference 13D/A filings named in the brief
await get("https://www.sec.gov/Archives/edgar/data/1326380/000119312526260340/primary_doc.xml", "sched13d-gamestop-filer-ebay.xml");
await get("https://www.sec.gov/Archives/edgar/data/1326380/000092189526000062/primary_doc.xml", "sched13d-ryancohen-gamestop.xml");
// newest Forms 4 (raw XML = primaryDocument without the xsl…/ directory)
if (subs) {
  const r = JSON.parse(subs).filings.recent;
  let n = 0;
  for (let i = 0; i < r.form.length && n < 6; i++) {
    if (r.form[i] !== "4" || !r.primaryDocument[i].endsWith(".xml")) continue;
    const acc = r.accessionNumber[i].replace(/-/g, "");
    await get(`https://www.sec.gov/Archives/edgar/data/1326380/${acc}/${r.primaryDocument[i].replace(/^xsl[^/]*\//, "")}`, `form4-${r.accessionNumber[i]}.xml`);
    n++;
  }
  const k8 = r.accessionNumber.findIndex((_, i) => r.form[i] === "8-K");
  if (k8 >= 0) await get(`https://www.sec.gov/Archives/edgar/data/1326380/${r.accessionNumber[k8].replace(/-/g, "")}/index.json`, "folder-index-8k.json");
  const f425 = r.accessionNumber.findIndex((_, i) => r.form[i] === "425");
  if (f425 >= 0) await get(`https://www.sec.gov/Archives/edgar/data/1326380/${r.accessionNumber[f425]}.txt`, "sec-header-425.txt", { range: "bytes=0-16383" });
}
await get("https://data.sec.gov/api/xbrl/companyfacts/CIK0001326380.json", "companyfacts-gme.json");
await get("https://news.google.com/rss/search?q=GameStop&hl=en-US&gl=US&ceid=US:en", "google-news.xml");
await get("https://investor.gamestop.com/eBay/default.aspx", "ir-ebay-page.html");
await get("https://investor.gamestop.com/warrant-dividend/default.aspx", "ir-warrant-page.html");
const rel = await get("https://investor.gamestop.com/news-releases/default.aspx", "ir-news-releases-page.html");
if (rel) {
  const found = [...rel.matchAll(/["'(]((?:https?:\/\/[^"')\s]+)?\/feed\/[A-Za-z]+\.svc\/[A-Za-z]+[^"')\s]*)/g)].map((m) => m[1]);
  console.log("IR feed URL candidates found in the page HTML:", found);
}
console.log(`\nSaved to ${out}. Compare with tests/fixtures (synthetic), fix parsers if they differ, then update tests.`);
