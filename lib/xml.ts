import { XMLParser } from "fast-xml-parser";

/** Strict numeric parse: returns null (never a guess) unless the whole string is a plain number. */
export function strictNum(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return Number(s.replace(/,/g, ""));
  return null;
}

/** Text of an XML node: handles "text", {value:"…"}, {"#text":"…"}. */
export function txt(node: unknown): string | undefined {
  if (node == null) return undefined;
  if (typeof node === "string") return node.trim() || undefined;
  if (typeof node === "number" || typeof node === "boolean") return String(node);
  if (Array.isArray(node)) return txt(node[0]);
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    if ("value" in o) return txt(o.value);
    if ("#text" in o) return txt(o["#text"]);
  }
  return undefined;
}

export function asArray<T>(x: T | T[] | undefined | null): T[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

export function makeParser(arrayTags: string[] = []) {
  const set = new Set(arrayTags);
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    removeNSPrefix: true,
    processEntities: true,
    isArray: (name) => set.has(name),
  });
}

/** Depth-first search for every value whose key matches `pred`. */
export function findAll(node: unknown, pred: (key: string) => boolean, out: unknown[] = [], depth = 0): unknown[] {
  if (depth > 12 || node == null || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const n of node) findAll(n, pred, out, depth + 1);
    return out;
  }
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (pred(k)) out.push(v);
    findAll(v, pred, out, depth + 1);
  }
  return out;
}

export function findFirstText(node: unknown, pred: (key: string) => boolean): string | undefined {
  for (const v of findAll(node, pred)) {
    const t = txt(v);
    if (t) return t;
  }
  return undefined;
}
