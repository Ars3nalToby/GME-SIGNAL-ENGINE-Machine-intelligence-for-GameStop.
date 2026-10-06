// Visual check (optional).  BASE_URL=http://localhost:3000 [FEED_JSON=path] OUT=screenshots node scripts/screenshots.mjs
// FEED_JSON only intercepts /api/feed in the *test browser* to review layouts with populated data; the app never reads it.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.OUT ?? "screenshots";
fs.mkdirSync(out, { recursive: true });
const feed = process.env.FEED_JSON ? fs.readFileSync(process.env.FEED_JSON, "utf8") : null;
const exe = fs.readdirSync("/opt/pw-browsers").filter((d) => d.startsWith("chromium-")).map((d) => path.join("/opt/pw-browsers", d, "chrome-linux", "chrome")).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe });
const sizes = [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]];
const pages = (process.env.PAGES ?? "/").split(",");
const problems = [];
for (const [name, viewport] of sizes) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) problems.push(`[${name}] ${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on("pageerror", (e) => problems.push(`[${name}] pageerror: ${e.message}`));
  if (feed) await page.route("**/api/feed", (r) => r.fulfill({ status: 200, contentType: "application/json", body: feed }));
  for (const p of pages) {
    await page.goto(base + p, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const file = path.join(out, `${name}${p === "/" ? "-home" : p.replace(/\//g, "-")}${feed ? "-populated" : ""}.png`);
    await page.screenshot({ path: file, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(file, overflow > 1 ? `HORIZONTAL OVERFLOW ${overflow}px` : "ok");
  }
  await ctx.close();
}
await browser.close();
console.log(problems.length ? `console problems:\n${problems.join("\n")}` : "no console errors or warnings");
