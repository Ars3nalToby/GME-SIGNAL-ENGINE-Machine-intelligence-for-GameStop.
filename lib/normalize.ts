/** Small pure helpers shared by normalizers (client-safe: no node:crypto). */

/** cyrb53 string hash → 14 hex chars. Stable across server/client. */
export function hash(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/** lowercase, strip publisher suffix and punctuation, collapse whitespace (SPEC §9). */
export function normalizeTitle(title: string, publisher?: string): string {
  let t = title.trim();
  if (publisher) {
    const suffix = ` - ${publisher}`.toLowerCase();
    if (t.toLowerCase().endsWith(suffix)) t = t.slice(0, t.length - suffix.length);
  }
  return t
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeUrl(u: string): string {
  try {
    const x = new URL(u);
    x.hash = "";
    let p = x.pathname.replace(/\/+$/, "");
    if (!p) p = "";
    return `${x.protocol}//${x.host.toLowerCase()}${p}${x.search}`;
  } catch {
    return u.trim();
  }
}

const STOP = new Set(["the", "a", "an", "of", "to", "in", "on", "for", "and", "or", "at", "by", "as", "is", "its", "with", "from"]);
export function tokenSet(normTitle: string): Set<string> {
  return new Set(normTitle.split(" ").filter((w) => w.length > 1 && !STOP.has(w)));
}
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
