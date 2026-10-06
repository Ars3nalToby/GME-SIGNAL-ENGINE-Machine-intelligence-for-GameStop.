import "server-only";
/** Google News RSS (SPEC §7.7). Links are Google redirect URLs — kept as-is and labelled "via Google News". */
import { z } from "zod";
import { cache } from "../cache";
import { NEWS_QUERIES, NEWS_RELEVANCE } from "../config/watch";
import { tierOf, type Tier } from "../config/publishers";
import { getText, shortError } from "../http";
import { makeHealth } from "../health";
import { hash, normalizeTitle } from "../normalize";
import { peopleIn } from "../people";
import { scoreNews } from "../scoring";
import { htmlToText, truncate } from "../text";
import type { SourceResult, WireItem } from "../types";
import { asArray, makeParser, txt } from "../xml";

const NEWS_TTL = 5 * 60_000;

const RssItem = z.object({
  title: z.unknown(),
  link: z.unknown(),
  pubDate: z.unknown().optional(),
  description: z.unknown().optional(),
  source: z.unknown().optional(),
});

export type RawNews = { title: string; link: string; pubDate?: string; description?: string; publisher?: string };

export function parseGoogleNewsRss(xml: string): RawNews[] {
  const root = makeParser(["item"]).parse(xml) as { rss?: { channel?: { item?: unknown[] } } };
  const items = asArray(root.rss?.channel?.item);
  if (!root.rss?.channel) throw new Error("not an RSS document");
  const out: RawNews[] = [];
  for (const raw of items) {
    const p = RssItem.safeParse(raw);
    if (!p.success) continue;
    const title = txt(p.data.title);
    const link = txt(p.data.link);
    if (!title || !link) continue;
    out.push({ title, link, pubDate: txt(p.data.pubDate), description: txt(p.data.description), publisher: txt(p.data.source) });
  }
  return out;
}

export function normalizeNews(raw: RawNews[], nowIso: string): WireItem[] {
  const out: WireItem[] = [];
  for (const r of raw) {
    let publisher = r.publisher?.trim();
    let title = htmlToText(r.title);
    if (publisher) {
      const suf = ` - ${publisher}`;
      if (title.toLowerCase().endsWith(suf.toLowerCase())) title = title.slice(0, -suf.length).trim();
    } else {
      const m = title.match(/^(.*) - ([^-]{2,40})$/);
      if (m) {
        title = m[1]!.trim();
        publisher = m[2]!.trim();
      }
    }
    const desc = htmlToText(r.description);
    if (!NEWS_RELEVANCE.test(`${title} ${desc}`)) continue;
    const ts = r.pubDate ? Date.parse(r.pubDate) : NaN;
    if (Number.isNaN(ts)) continue; // no trustworthy date ⇒ not placed on a timeline
    const tier: Tier = tierOf(publisher);
    const sc = scoreNews(tier, title);
    const norm = normalizeTitle(title, publisher);
    out.push({
      id: `news:${hash(norm)}`,
      sourceType: "news",
      source: `${publisher ?? "Unknown outlet"} · via Google News`,
      credibility: tier === "t1" ? "reporting_tier1" : tier === "opinion" ? "opinion" : "reporting",
      title,
      summary: desc && normalizeTitle(desc) !== norm ? truncate(desc, 240) : undefined,
      publishedAt: new Date(ts).toISOString(),
      fetchedAt: nowIso,
      url: r.link,
      people: peopleIn(title),
      tags: ["News", tier === "opinion" ? "Opinion" : tier.toUpperCase()],
      score: sc.score,
      signal: sc.signal,
      scoreReasons: sc.reasons,
      newsTier: tier,
      outlet: publisher ?? "Unknown outlet",
      via: "via Google News",
      author: publisher,
    });
  }
  return out;
}

export function newsUrl(q: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
}

type NewsBundle = { items: WireItem[]; ok: number; total: number; errors: string[] };

async function fetchNews(nowMs: number): Promise<NewsBundle> {
  const results = await Promise.allSettled(NEWS_QUERIES.map(async (q) => parseGoogleNewsRss(await getText(newsUrl(q.q), { revalidate: 300 }))));
  const nowIso = new Date(nowMs).toISOString();
  const errors: string[] = [];
  const items: WireItem[] = [];
  let ok = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      ok++;
      items.push(...normalizeNews(r.value, nowIso));
    } else errors.push(`${NEWS_QUERIES[i]!.id}: ${shortError(r.reason)}`);
  });
  if (ok === 0) throw new Error(errors[0] ?? "all news queries failed");
  // collapse same-id items across queries (keep the first)
  const byId = new Map<string, WireItem>();
  for (const it of items) if (!byId.has(it.id)) byId.set(it.id, it);
  return { items: [...byId.values()], ok, total: NEWS_QUERIES.length, errors };
}

export async function loadNews(opts: { force?: boolean; nowMs?: number } = {}): Promise<SourceResult> {
  const nowMs = opts.nowMs ?? Date.now();
  try {
    const r = await cache.get("news:bundle", NEWS_TTL, () => fetchNews(nowMs), { force: opts.force });
    const b = r.value;
    const note = b.errors.length ? `${b.ok}/${b.total} queries ok — ${b.errors.join("; ")}` : `${b.ok}/${b.total} queries ok`;
    return { items: b.items, health: makeHealth({ id: "news", label: "News (Google News RSS)", itemCount: b.items.length, nowMs, result: r, attemptedAt: cache.lastAttemptAt("news:bundle"), note }) };
  } catch (e) {
    return { items: [], health: makeHealth({ id: "news", label: "News (Google News RSS)", itemCount: 0, nowMs, error: e, attemptedAt: nowMs }) };
  }
}
