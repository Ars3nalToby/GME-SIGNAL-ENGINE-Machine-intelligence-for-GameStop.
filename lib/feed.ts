import "server-only";
import { dedupe } from "./dedupe";
import { getEnv } from "./config/env";
import { hash, normalizeUrl } from "./normalize";
import { scoreIr } from "./scoring";
import { loadIr } from "./sources/ir";
import { loadMarket } from "./sources/market";
import { loadNews } from "./sources/news";
import { loadSec, type SecBundle } from "./sources/sec";
import { loadX, xWatchList, type XWatchEntry } from "./sources/x";
import type { FeedResponse, SourceHealth, SourceResult, WireItem } from "./types";
import { makeHealth } from "./health";
import type { IrPages } from "./sources/ir";

export type FeedPayload = FeedResponse & { xWatch: XWatchEntry[]; xConnected: boolean };

/** 8-K Ex. 99.1 press releases, used only when the IR feed is down (SPEC §7.5). Labelled "via SEC 8-K". */
export function irFallbackFromSec(secItems: WireItem[], nowIso: string): WireItem[] {
  const out: WireItem[] = [];
  for (const s of secItems) {
    const ex = s.altLinks?.find((l) => l.label.startsWith("Press release (Ex. 99.1)"));
    if (!ex || !/^8-K/.test(s.form ?? "")) continue;
    const title = `Press release filed with ${s.title}`;
    const sc = scoreIr(title);
    out.push({
      id: `ir:${hash(normalizeUrl(ex.url))}`,
      sourceType: "ir",
      source: "GameStop IR · via SEC 8-K",
      credibility: "official_company",
      title,
      summary: s.summary,
      publishedAt: s.publishedAt,
      fetchedAt: nowIso,
      url: ex.url,
      altLinks: [{ label: "8-K filing index", url: s.altLinks?.[0]?.url ?? s.url }],
      accessionNumber: s.accessionNumber,
      people: [],
      tags: ["GameStop IR", "via SEC 8-K"],
      score: sc.score,
      signal: sc.signal,
      scoreReasons: [...sc.reasons, "IR feed unavailable: Ex. 99.1 from SEC 8-K"],
      via: "via SEC 8-K",
    });
  }
  return out;
}

async function guard<T extends SourceResult>(id: SourceHealth["id"], label: string, nowMs: number, fn: () => Promise<T>): Promise<T | SourceResult> {
  try {
    return await fn();
  } catch (e) {
    return { items: [], health: makeHealth({ id, label, itemCount: 0, nowMs, error: e, attemptedAt: nowMs }) };
  }
}

export type FeedBuild = FeedPayload & { secBundle?: SecBundle; irPages?: IrPages };

export async function buildFeed(opts: { force?: boolean; nowMs?: number } = {}): Promise<FeedBuild> {
  const nowMs = opts.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const o = { force: opts.force, nowMs };
  const [sec, ir, news, x, market] = await Promise.all([
    guard("sec", "SEC EDGAR", nowMs, () => loadSec(o)),
    guard("ir", "GameStop IR", nowMs, () => loadIr(o)),
    guard("news", "News (Google News RSS)", nowMs, () => loadNews(o)),
    guard("x", "X API", nowMs, () => loadX(o)),
    loadMarket(o).catch((e) => ({ snapshot: undefined, health: makeHealth({ id: "market", label: "Market data", itemCount: 0, nowMs, error: e }) })),
  ]);
  let irItems = ir.items;
  if (ir.health.status === "error") {
    const fb = irFallbackFromSec(sec.items, nowIso);
    const have = new Set(irItems.map((i) => i.id));
    irItems = [...irItems, ...fb.filter((f) => !have.has(f.id))];
  }
  const merged = dedupe([...sec.items, ...irItems, ...news.items, ...x.items]);
  const env = getEnv();
  return {
    items: merged,
    sources: [sec.health, ir.health, news.health, x.health, market.health],
    generatedAt: nowIso,
    xWatch: xWatchList(env),
    xConnected: !!env.xToken,
    secBundle: (sec as { bundle?: SecBundle }).bundle,
    irPages: (ir as { pages?: IrPages }).pages,
  };
}
