/** Dedupe & clustering (SPEC §9). Pure. */
import type { WireItem } from "./types";
import { jaccard, normalizeTitle, normalizeUrl, tokenSet } from "./normalize";

const H = 3_600_000;
const tierRank: Record<string, number> = { t1: 4, t2: 3, t3: 2, opinion: 1 };

function better(a: WireItem, b: WireItem): boolean {
  // representative = highest score, then higher tier, then earliest
  if (a.score !== b.score) return a.score > b.score;
  const ta = tierRank[a.newsTier ?? "t3"] ?? 0;
  const tb = tierRank[b.newsTier ?? "t3"] ?? 0;
  if (ta !== tb) return ta > tb;
  return Date.parse(a.publishedAt) < Date.parse(b.publishedAt);
}

const outletOf = (i: WireItem) => i.outlet ?? i.source;

function fold(rep: WireItem, dup: WireItem) {
  const outlets = new Set(rep.cluster?.outlets ?? []);
  outlets.add(outletOf(dup));
  for (const o of dup.cluster?.outlets ?? []) outlets.add(o);
  outlets.delete(outletOf(rep));
  rep.cluster = { count: outlets.size, outlets: [...outlets] };
  rep.alsoReportedBy = [...(rep.alsoReportedBy ?? []), { outlet: outletOf(dup), url: dup.url }, ...(dup.alsoReportedBy ?? [])];
}

export function dedupe(input: WireItem[]): WireItem[] {
  const items = input.map((i) => ({ ...i, cluster: i.cluster ? { ...i.cluster } : undefined, alsoReportedBy: i.alsoReportedBy ? [...i.alsoReportedBy] : undefined }));

  // 1) exact: same URL, or same normalized title + UTC day (within the same source type)
  const byKey = new Map<string, WireItem>();
  const kept: WireItem[] = [];
  for (const it of items.sort((a, b) => (better(a, b) ? -1 : 1))) {
    // title+day only identifies "the same story" for news; filings and posts with equal titles are distinct items
    const keys = [`u:${normalizeUrl(it.url)}`];
    if (it.sourceType === "news") keys.push(`t:news:${normalizeTitle(it.title)}:${it.publishedAt.slice(0, 10)}`);
    const hit = keys.map((k) => byKey.get(k)).find(Boolean);
    if (hit) {
      // same story from another outlet (news ids are hash(title), so equal ids are expected here)
      if (it.sourceType === "news" && hit !== it) fold(hit, it);
      continue;
    }
    keys.forEach((k) => byKey.set(k, it));
    kept.push(it);
  }

  // 2) IR ← news (Jaccard ≥ 0.8 within 24h): "Also reported by …"
  const ir = kept.filter((i) => i.sourceType === "ir");
  const out: WireItem[] = [];
  const irTokens = new Map(ir.map((i) => [i.id, tokenSet(normalizeTitle(i.title))] as const));
  for (const it of kept) {
    if (it.sourceType === "news") {
      const toks = tokenSet(normalizeTitle(it.title));
      const home = ir.find((r) => Math.abs(Date.parse(r.publishedAt) - Date.parse(it.publishedAt)) <= 24 * H && jaccard(irTokens.get(r.id)!, toks) >= 0.8);
      if (home) {
        fold(home, it);
        continue;
      }
    }
    out.push(it);
  }

  // 3) near-duplicate news clusters (Jaccard ≥ 0.75 within 48h)
  const news = out.filter((i) => i.sourceType === "news").sort((a, b) => (better(a, b) ? -1 : 1));
  const reps: { item: WireItem; toks: Set<string> }[] = [];
  const dropped = new Set<WireItem>(); // by identity: news ids are hash(title), so equal ids must not drop the representative
  for (const it of news) {
    const toks = tokenSet(normalizeTitle(it.title));
    const rep = reps.find((r) => Math.abs(Date.parse(r.item.publishedAt) - Date.parse(it.publishedAt)) <= 48 * H && jaccard(r.toks, toks) >= 0.75);
    if (rep) {
      fold(rep.item, it);
      dropped.add(it);
    } else reps.push({ item: it, toks });
  }
  // ids must be unique (they are React keys and saved-item keys): news ids are hash(title), so the same
  // headline on two different days would collide — keep the first (highest-ranked) occurrence
  const seenIds = new Set<string>();
  const final = out.filter((i) => {
    if (dropped.has(i) || seenIds.has(i.id)) return false;
    seenIds.add(i.id);
    return true;
  });
  return final.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || b.score - a.score);
}
