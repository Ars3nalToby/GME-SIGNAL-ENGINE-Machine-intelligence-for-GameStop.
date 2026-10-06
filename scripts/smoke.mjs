// Smoke-test every route of a running server.  BASE_URL=http://localhost:3000 [DASHBOARD_PASSWORD=…] node scripts/smoke.mjs
const base = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const headers = process.env.DASHBOARD_PASSWORD ? { authorization: `Basic ${Buffer.from(`u:${process.env.DASHBOARD_PASSWORD}`).toString("base64")}` } : {};

const json = [
  ["/api/feed", (j) => Array.isArray(j.items) && Array.isArray(j.sources) && j.sources.length === 5 && typeof j.generatedAt === "string"],
  ["/api/sec", (j) => Array.isArray(j.items) && j.health?.id === "sec"],
  ["/api/ir", (j) => Array.isArray(j.items) && j.health?.id === "ir"],
  ["/api/x", (j) => Array.isArray(j.items) && j.health?.id === "x"],
  ["/api/news", (j) => Array.isArray(j.items) && j.health?.id === "news"],
  ["/api/insiders", (j) => Array.isArray(j.filings) && Array.isArray(j.sched13) && j.health],
  ["/api/fundamentals", (j) => "fundamentals" in j && j.health],
  ["/api/health", (j) => ["live", "degraded", "error"].includes(j.status) && j.config && typeof j.config.secUserAgent === "boolean"],
  ["/healthz", (j) => j.ok === true],
];
const pages = ["/", "/insiders", "/rc", "/warrants", "/ma", "/capital", "/treasury"];

let failed = 0;
const row = (ok, path, status, note = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${String(status).padEnd(4)} ${path}  ${note}`);
};

for (const [path, check] of json) {
  try {
    const res = await fetch(base + path, { headers });
    const body = await res.json().catch(() => null);
    const sources = body?.sources ?? (body?.health ? [body.health] : []);
    const note = sources.map((s) => `${s.id}:${s.status}`).join(" ");
    row(res.status === 200 && !!body && !!check(body), path, res.status, note);
  } catch (e) {
    row(false, path, "ERR", e.message);
  }
}
for (const path of pages) {
  try {
    const res = await fetch(base + path, { headers });
    const html = await res.text();
    row(res.status === 200 && html.includes("GME LIVE WIRE"), path, res.status, `${html.length} bytes`);
  } catch (e) {
    row(false, path, "ERR", e.message);
  }
}
process.exit(failed ? 1 : 0);
