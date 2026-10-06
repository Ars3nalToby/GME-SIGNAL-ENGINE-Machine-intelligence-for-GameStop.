import "server-only";
/**
 * GameStop Investor Relations (SPEC §7.5). Text extraction only — source HTML is never rendered.
 * NOTE: the Q4 press-release endpoint below is the standard Q4 service pattern and has NOT been verified
 * against the live site from the build sandbox. Failure is reported in Source Health; IR_FEED_URL overrides it.
 */
import * as cheerio from "cheerio";
import { z } from "zod";
import { cache } from "../cache";
import { IR_BASE, IR_FEED_CANDIDATE, IR_PAGES } from "../config/watch";
import { getEnv } from "../config/env";
import { getText, HttpError, shortError } from "../http";
import { makeHealth } from "../health";
import { hash, normalizeUrl } from "../normalize";
import { scoreIr } from "../scoring";
import { htmlToText, truncate } from "../text";
import { parseIrDateEx } from "../time";
import { peopleIn } from "../people";
import type { SourceResult, WireItem } from "../types";

const IR_TTL = 5 * 60_000;

// ---------------- Q4 JSON feed ----------------
const Q4Item = z
  .object({
    Headline: z.string().optional(),
    Title: z.string().optional(),
    LinkToDetailPage: z.string().optional(),
    PressReleaseDate: z.string().optional(),
    ShortBody: z.string().nullish(),
    ShortDescription: z.string().nullish(),
    Subheadline: z.string().nullish(),
  })
  .passthrough();
const Q4Payload = z.union([z.object({ GetPressReleaseListResult: z.array(Q4Item) }).passthrough(), z.array(Q4Item)]);

export type IrEntry = { title: string; url: string; date?: string; dateOnly?: boolean; summary?: string; kind: "news" | "filing" | "document" | "link" };

export function absUrl(href: string, base = IR_BASE): string | undefined {
  try {
    const u = new URL(href, base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function parseIrFeed(json: unknown): IrEntry[] {
  const parsed = Q4Payload.safeParse(json);
  if (!parsed.success) throw new Error("unrecognised IR feed payload shape");
  const list = Array.isArray(parsed.data) ? parsed.data : parsed.data.GetPressReleaseListResult;
  const out: IrEntry[] = [];
  for (const r of list) {
    const title = htmlToText(r.Headline ?? r.Title);
    const url = r.LinkToDetailPage ? absUrl(r.LinkToDetailPage) : undefined;
    if (!title || !url) continue;
    const pd = r.PressReleaseDate ? parseIrDateEx(r.PressReleaseDate) : null;
    const date = pd?.iso;
    const summary = htmlToText(r.ShortBody ?? r.ShortDescription ?? r.Subheadline);
    out.push({ title, url, date, dateOnly: pd?.dateOnly, summary: summary ? truncate(summary, 280) : undefined, kind: "news" });
  }
  if (list.length > 0 && out.length === 0) throw new Error("IR feed items had no headline/link fields");
  return out;
}

/** Find Q4-style /feed/*.svc endpoints in page HTML or script text. */
export function discoverFeedUrls(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/["'(]((?:https?:\/\/[^"')\s]+)?\/feed\/[A-Za-z]+\.svc\/[A-Za-z]+[^"')\s]*)/g)) {
    const u = absUrl(m[1]!.replace(/&amp;/g, "&"));
    if (u && new URL(u).host === new URL(IR_BASE).host) found.add(u);
  }
  return [...found];
}

async function discoverEndpoint(): Promise<string | undefined> {
  const html = await getText(IR_PAGES.releases, { timeoutMs: 8000 });
  const direct = discoverFeedUrls(html).find((u) => /PressRelease/i.test(u));
  if (direct) return direct;
  const $ = cheerio.load(html);
  const scripts = $("script[src]").map((_, el) => absUrl($(el).attr("src") ?? "")).get().filter((u): u is string => !!u && new URL(u).host === new URL(IR_BASE).host).slice(0, 4);
  for (const s of scripts) {
    try {
      const js = await getText(s, { timeoutMs: 6000, revalidate: 3600 });
      const hit = discoverFeedUrls(js).find((u) => /PressRelease/i.test(u));
      if (hit) return hit;
    } catch {
      /* try next */
    }
  }
  return undefined;
}

async function fetchIrFeed(): Promise<{ entries: IrEntry[]; endpoint: string }> {
  const env = getEnv();
  const primary = env.irFeedUrl ?? IR_FEED_CANDIDATE;
  try {
    const json = await getText(primary, { headers: { accept: "application/json" }, revalidate: 300 });
    return { entries: parseIrFeed(JSON.parse(json)), endpoint: primary };
  } catch (first) {
    if (env.irFeedUrl) throw first;
    // candidate endpoint failed: look for the real one in the page's scripts
    const found = await discoverEndpoint().catch(() => undefined);
    if (!found || found === primary) throw first;
    const json = await getText(found, { headers: { accept: "application/json" }, revalidate: 300 });
    return { entries: parseIrFeed(JSON.parse(json)), endpoint: found };
  }
}

// ---------------- server-rendered pages ----------------
const DATE_RES: RegExp[] = [
  /\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(20\d\d)\b/,
  /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.? \d{1,2}, 20\d\d\b/,
];
const GENERIC = /^(read more|view|view all|more|home|download|learn more|click here|pdf|rss|sign up|print|share|email|next|previous|skip to .*)$/i;

function findDate(text: string): { iso: string; dateOnly: boolean } | undefined {
  for (const re of DATE_RES) {
    const m = text.match(re);
    if (m) {
      const d = parseIrDateEx(m[0].replace(/\./g, "").replace("Sept", "Sep"));
      if (d) return d;
    }
  }
  return undefined;
}

export function parseIrPage(html: string, baseUrl: string): IrEntry[] {
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, header, footer, form").remove();
  const out = new Map<string, IrEntry>();
  $("a[href]").each((_, el) => {
    const a = $(el);
    const url = absUrl(a.attr("href") ?? "", baseUrl);
    const title = a.text().replace(/\s+/g, " ").trim();
    if (!url || title.length < 12 || GENERIC.test(title)) return;
    const host = new URL(url).host;
    const path = new URL(url).pathname.toLowerCase();
    const kind: IrEntry["kind"] = /sec\.gov$/.test(host) ? "filing" : /news-release|press-release/.test(path) ? "news" : /\.(pdf|docx?|xlsx?)$|static-files|\/documents?\//.test(path) ? "document" : "link";
    // a date counts only when it sits in the link's OWN row/list item: walking further up could attach a
    // neighbouring entry's date (parse-or-admit: no date is better than a wrong one)
    const row = a.closest("li, tr, article");
    let scope = "";
    if (row.length) {
      // a row with several real links gives its date to the first one only (the others are ambiguous)
      const links = row.find("a[href]").filter((_, el) => $(el).text().replace(/\s+/g, " ").trim().length >= 12);
      if (links.length <= 1 || links.first().is(a)) scope = row.text();
    } else {
      // no row wrapper: only the link's own text and its sibling <time>/date elements
      scope = `${a.text()} ${a.siblings("time, .date, [class*='date']").text()}`;
    }
    const t = scope.replace(/\s+/g, " ").trim();
    const found = t.length <= 400 ? findDate(t) : undefined;
    const date = found?.iso;
    if (kind === "link" && !date) return;
    const key = normalizeUrl(url);
    if (!out.has(key)) out.set(key, { title, url, date, dateOnly: found?.dateOnly, kind });
  });
  return [...out.values()];
}

export type IrPages = { ebay: IrEntry[]; warrants: IrEntry[]; newsroom: IrEntry[]; errors: Record<string, string> };

export async function loadIrPages(force = false): Promise<IrPages> {
  const errors: Record<string, string> = {};
  const one = async (id: keyof typeof IR_PAGES, url: string) => {
    try {
      const r = await cache.get(`ir:page:${id}`, IR_TTL, async () => parseIrPage(await getText(url, { revalidate: 300 }), url), { force });
      if (r.stale && r.error) errors[id] = `STALE: ${r.error}`;
      return r.value;
    } catch (e) {
      errors[id] = shortError(e);
      return [];
    }
  };
  const [ebay, warrants, newsroom] = await Promise.all([one("ebay", IR_PAGES.ebay), one("warrants", IR_PAGES.warrants), one("newsroom", IR_PAGES.newsroom)]);
  return { ebay, warrants, newsroom, errors };
}

// ---------------- items ----------------
export function irEntryToItem(e: IrEntry, nowIso: string, tags: string[] = []): WireItem | undefined {
  if (!e.date) return undefined;
  const text = `${e.title} ${e.summary ?? ""}`;
  const sc = scoreIr(text);
  const t = new Set(["GameStop IR", ...tags]);
  if (/\bebay\b/i.test(text)) t.add("eBay");
  if (/\bwarrants?\b/i.test(text)) t.add("Warrants");
  if (/\bbitcoin\b/i.test(text)) t.add("Bitcoin");
  return {
    id: `ir:${hash(normalizeUrl(e.url))}`,
    sourceType: "ir",
    source: "GameStop IR",
    credibility: "official_company",
    title: e.title,
    summary: e.summary,
    publishedAt: e.date,
    dateOnly: e.dateOnly,
    fetchedAt: nowIso,
    url: e.url,
    people: peopleIn(text),
    tags: [...t],
    score: sc.score,
    signal: sc.signal,
    scoreReasons: sc.reasons,
  };
}

export async function loadIr(opts: { force?: boolean; nowMs?: number } = {}): Promise<SourceResult & { pages?: IrPages; endpoint?: string }> {
  const nowMs = opts.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const pagesP = loadIrPages(opts.force);
  try {
    const feed = await cache.get("ir:feed", IR_TTL, fetchIrFeed, { force: opts.force });
    const pages = await pagesP;
    const items = new Map<string, WireItem>();
    for (const e of feed.value.entries) {
      const it = irEntryToItem(e, nowIso);
      if (it) items.set(normalizeUrl(it.url), it);
    }
    for (const [list, tag] of [[pages.ebay, "eBay"], [pages.warrants, "Warrants"], [pages.newsroom, ""]] as const) {
      for (const e of list) {
        if (e.kind === "filing") continue; // SEC filings come from the SEC source
        const it = irEntryToItem(e, nowIso, tag ? [tag] : []);
        if (it && !items.has(normalizeUrl(it.url))) items.set(normalizeUrl(it.url), it);
      }
    }
    const pageErr = Object.entries(pages.errors).map(([k, v]) => `${k} page: ${v}`);
    const list = [...items.values()];
    return {
      items: list,
      pages,
      endpoint: feed.value.endpoint,
      health: makeHealth({ id: "ir", label: "GameStop IR", itemCount: list.length, nowMs, result: feed, attemptedAt: cache.lastAttemptAt("ir:feed"), note: [`feed: ${new URL(feed.value.endpoint).pathname}`, ...pageErr].join(" · ") }),
    };
  } catch (e) {
    const pages = await pagesP;
    // the feed is down: the server-rendered pages may still provide dated items
    const items: WireItem[] = [];
    for (const [list, tag] of [[pages.ebay, "eBay"], [pages.warrants, "Warrants"], [pages.newsroom, ""]] as const) {
      for (const en of list) {
        if (en.kind === "filing") continue;
        const it = irEntryToItem(en, nowIso, tag ? [tag] : []);
        if (it) items.push(it);
      }
    }
    const h = makeHealth({ id: "ir", label: "GameStop IR", itemCount: items.length, nowMs, error: e, attemptedAt: nowMs });
    h.note = items.length ? `press-release feed down; ${items.length} dated item(s) from server-rendered IR pages; 8-K fallback active` : "press-release feed down; 8-K Ex. 99.1 fallback active (via SEC 8-K)";
    return { items, pages, health: h };
  }
}

export { HttpError };
