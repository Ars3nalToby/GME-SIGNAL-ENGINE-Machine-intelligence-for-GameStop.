// Verifies which timezone data.sec.gov's `acceptanceDateTime` represents, by comparing against the
// "Accepted" time on each filing's index page (Eastern).  Needs sec.gov access.
//   SEC_USER_AGENT="Your Name you@example.com" node scripts/verify-acceptance.mjs
const ua = process.env.SEC_USER_AGENT;
if (!ua) {
  console.error("Set SEC_USER_AGENT.");
  process.exit(2);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (u) => {
  await sleep(250);
  const r = await fetch(u, { headers: { "user-agent": ua } });
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  return r.text();
};
const sub = JSON.parse(await get("https://data.sec.gov/submissions/CIK0001326380.json")).filings.recent;
const results = [];
for (let i = 0; i < Math.min(8, sub.accessionNumber.length); i++) {
  const acc = sub.accessionNumber[i];
  const raw = sub.acceptanceDateTime[i];
  const page = await get(`https://www.sec.gov/Archives/edgar/data/1326380/${acc.replace(/-/g, "")}/${acc}-index.htm`);
  const m = page.match(/Accepted<\/div>\s*<div[^>]*>\s*([\d-]+ [\d:]+)/) ?? page.match(/Accepted[^0-9]{0,80}([\d]{4}-[\d]{2}-[\d]{2} [\d]{2}:[\d]{2}:[\d]{2})/);
  results.push({ acc, raw, indexAcceptedET: m?.[1] ?? "(not found — check regex vs page markup)" });
}
console.table(results);
const verdict = results.filter((r) => r.indexAcceptedET.includes(" ")).map((r) => {
  const rawWall = r.raw.replace("T", " ").slice(0, 19);
  return rawWall === r.indexAcceptedET ? "ET-wall-clock" : "different";
});
console.log("If every row says ET-wall-clock, acceptanceDateTime is Eastern despite the 'Z' suffix → set SEC_ACCEPTANCE_TZ=America/New_York.");
console.log("If rows differ by 4/5 h, it is UTC → SEC_ACCEPTANCE_TZ=UTC.  Verdicts:", verdict);
