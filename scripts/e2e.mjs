// Browser interaction checks against a running server (Playwright). BASE_URL=http://localhost:3000 node scripts/e2e.mjs
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const exe = fs.readdirSync("/opt/pw-browsers").filter((d) => d.startsWith("chromium-")).map((d) => path.join("/opt/pw-browsers", d, "chrome-linux", "chrome")).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const problems = [];
page.on("console", (m) => ["error", "warning"].includes(m.type()) && problems.push(m.text().slice(0, 200)));
page.on("pageerror", (e) => problems.push(e.message));
const ok = (name) => console.log("PASS", name);

await page.goto(base, { waitUntil: "networkidle" });
await page.waitForSelector("article");
const total = await page.locator("article").count();
assert.ok(total >= 5, `expected cards, got ${total}`);
ok(`feed rendered ${total} cards`);

// X posts present (X token configured in the e2e run) with initials badge and original-post URL
const xCard = page.locator("article", { hasText: "X · @ryancohen" }).first();
assert.ok(await xCard.count(), "no X card");
assert.match(await xCard.locator("a", { hasText: "OPEN" }).getAttribute("href"), /^https:\/\/x\.com\/ryancohen\/status\/\d+$/);
ok("X card links to the original post");

// score reasons toggle
const first = page.locator("article").first();
await first.locator("button.score").click();
await first.getByText("Score reasons").waitFor();
ok("score reasons expand");

// filters
await page.getByRole("button", { name: "SEC", exact: true }).click();
assert.equal(await page.locator("article", { hasText: "via Google News" }).count(), 0);
await page.getByRole("button", { name: "NEWS", exact: true }).click();
assert.ok(await page.locator("article", { hasText: "via Google News" }).count() > 0);
await page.getByRole("button", { name: "RYAN / LARRY" }).click();
const people = await page.locator("article").count();
assert.ok(people >= 2, "people filter");
await page.getByRole("button", { name: "ALL", exact: true }).click();
await page.getByRole("button", { name: "HIGH only" }).click();
await page.waitForFunction(() => document.querySelector('button[aria-pressed="true"]') && [...document.querySelectorAll("article button.score")].every((b) => b.textContent.includes("HIGH")));
for (const t of await page.locator("article button.score").allTextContents()) assert.match(t, /HIGH/);
await page.getByRole("button", { name: "HIGH only" }).click();
ok("filters (SEC / NEWS / RYAN-LARRY / HIGH only)");

// search + watch-word chip
await page.getByPlaceholder("Search eBay, warrant, Form 4…").fill("warrant");
assert.ok((await page.locator("article").count()) < total);
await page.getByPlaceholder("Search eBay, warrant, Form 4…").fill("");
await page.getByRole("button", { name: 'Search for eBay' }).click();
assert.equal(await page.getByPlaceholder("Search eBay, warrant, Form 4…").inputValue(), "eBay");
await page.getByRole("button", { name: "Clear search" }).click();
ok("search and watch-word chip");

// save → persists across reload, snapshot kept; ★ SAVED filter
const target = page.locator("article").nth(1);
const title = await target.locator("h3").innerText();
await target.getByRole("button", { name: /SAVE/ }).click();
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("article");
await page.getByRole("button", { name: /^★ SAVED \d+/ }).click();
assert.equal(await page.locator("article h3").first().innerText(), title);
ok("saved item persists across reload");
await page.getByRole("button", { name: "ALL", exact: true }).click();

// timeline view persists
await page.getByRole("button", { name: "Timeline" }).click();
await page.waitForSelector("section h3:has-text('Today'), section h3:has-text('Yesterday')");
await page.reload({ waitUntil: "networkidle" });
assert.ok(await page.getByRole("button", { name: "Timeline" }).getAttribute("aria-pressed") === "true");
ok("timeline view, persisted");

await page.getByRole("button", { name: "Cards" }).click();
await page.waitForSelector("article");
// catch a drifting headline → reader opens, keyboard works, read state persists
const chip = page.locator("button.dchip:not([aria-hidden])").first();
assert.ok(await chip.count(), "no drifting headlines");
await chip.click({ force: true });
const dlg = page.getByRole("dialog");
await dlg.waitFor();
const readerTitle = await dlg.locator("h2").innerText();
assert.ok(readerTitle.length > 3);
assert.ok(await dlg.getByRole("link", { name: /Open original source/ }).count() === 1, "reader must link the original");
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(150);
assert.notEqual(await dlg.locator("h2").innerText(), readerTitle, "next item");
await page.keyboard.press("Escape");
await dlg.waitFor({ state: "detached" });
ok("drifting headline opens the reader; arrow keys navigate; Esc closes");
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("article");
assert.ok((await page.locator("button.dchip.dchip-read").count()) >= 1, "read state persisted");
ok("read state persists across reload");
await page.locator("article").first().getByRole("button", { name: /^READ$|✓ READ/ }).click();
await page.getByRole("dialog").waitFor();
await page.getByRole("button", { name: "Close reader" }).click();
await page.getByRole("dialog").waitFor({ state: "detached" });
ok("card READ button opens and closes the reader");

// external links are safe
for (const a of await page.locator("article a[href^=http]").all()) {
  assert.equal(await a.getAttribute("target"), "_blank");
  assert.match((await a.getAttribute("rel")) ?? "", /noopener/);
}
ok("external links target=_blank rel=noopener noreferrer");

// storage blocked: the app still works
const ctx2 = await browser.newContext();
await ctx2.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } }); });
const p2 = await ctx2.newPage();
const errs2 = [];
p2.on("pageerror", (e) => errs2.push(e.message));
await p2.goto(base, { waitUntil: "networkidle" });
await p2.waitForSelector("article");
assert.equal(errs2.length, 0, errs2.join("; "));
ok("works with localStorage blocked");

await browser.close();
console.log(problems.length ? `console problems: ${problems.join(" | ")}` : "no console errors or warnings");
process.exit(problems.length ? 1 : 0);
