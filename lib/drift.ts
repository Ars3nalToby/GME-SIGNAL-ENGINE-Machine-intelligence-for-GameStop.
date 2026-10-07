import type { WireItem } from "./types";

const HOUR = 3_600_000;

/**
 * Which real wire items drift across the band: the best of the last `windowH` hours, ranked by score with a
 * recency penalty (so a fresh MED item can beat a stale HIGH one), then ordered newest-first. No filler, ever:
 * fewer items ⇒ fewer chips.
 */
export function pickDrift(items: WireItem[], nowMs: number, opts: { max?: number; windowH?: number } = {}): WireItem[] {
  const max = opts.max ?? 30;
  const windowH = opts.windowH ?? 72;
  if (!nowMs) return [];
  const rank = (i: WireItem) => i.score - ((nowMs - Date.parse(i.publishedAt)) / HOUR) * 0.8;
  return items
    .filter((i) => {
      const age = nowMs - Date.parse(i.publishedAt);
      return age >= 0 && age <= windowH * HOUR;
    })
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, max)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

export const laneCountFor = (n: number) => (n === 0 ? 0 : n < 4 ? 1 : n < 10 ? 2 : 3);

/** round-robin so every lane mixes newest and older items */
export function toLanes(items: WireItem[], laneCount: number): WireItem[][] {
  const lanes: WireItem[][] = Array.from({ length: laneCount }, () => []);
  items.forEach((it, i) => lanes[i % laneCount]!.push(it));
  return lanes;
}

/** seconds for one full pass of a lane (≈ constant reading speed, never faster than 45 s) */
export const laneDuration = (n: number) => Math.max(45, n * 9);

export function shorten(title: string, max = 84): string {
  const t = title.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}
