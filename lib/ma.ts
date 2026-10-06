/** M&A WATCH lane assignment — strictly by source type (SPEC §11.7). Pure. */
import type { WireItem } from "./types";

export type Lane = "confirmed" | "reporting" | "rumour";

const BASE_RE = /\b(acquir(?:e|es|ed|ing)|acquisitions?|mergers?|tender offers?|business combinations?|takeovers?)\b/i;
const MA_FORMS = /^(SC TO-[TIC]|SC 14D9|425|DEFC14A|PREC14A|DFAN14A|DEFA14A)(\/A)?$/i;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function maRegex(counterpartyNames: string[]): RegExp {
  const names = counterpartyNames.filter(Boolean).map((n) => esc(n.replace(/\s+(inc|corp|corporation|co|ltd|plc)\.?$/i, "")));
  return new RegExp(`${BASE_RE.source}${names.length ? `|\\b(${names.join("|")})\\b` : ""}`, "i");
}

export function isMaItem(i: WireItem, re: RegExp, counterpartyCiks: string[] = []): boolean {
  if (i.sourceType === "sec") {
    if (MA_FORMS.test(i.form ?? "")) return true;
    if (i.tags.includes("M&A")) return true;
    if (i.subject?.cik && counterpartyCiks.includes(i.subject.cik)) return true;
    if (i.filer?.cik && counterpartyCiks.includes(i.filer.cik)) return true;
  }
  return re.test(`${i.title} ${i.summary ?? ""}`);
}

export function laneOf(i: WireItem): Lane {
  if (i.sourceType === "sec" || i.sourceType === "ir") return "confirmed";
  if (i.sourceType === "x") return i.handle === "gamestop" || i.handle === "ryancohen" ? "confirmed" : "rumour";
  return i.newsTier === "t1" || i.newsTier === "t2" ? "reporting" : "rumour";
}

export type MaView = {
  confirmed: WireItem[];
  reporting: WireItem[];
  rumour: WireItem[];
  /** dated confirmed events (filings + official releases), oldest first */
  timeline: WireItem[];
};

export function buildMa(items: WireItem[], counterpartyNames: string[], counterpartyCiks: string[] = []): MaView {
  const re = maRegex(counterpartyNames);
  const out: MaView = { confirmed: [], reporting: [], rumour: [], timeline: [] };
  for (const i of items) {
    if (!isMaItem(i, re, counterpartyCiks)) continue;
    const lane = laneOf(i);
    const copy = lane === "confirmed" && i.sourceType === "x" ? { ...i, officialStatement: true } : i;
    out[lane].push(copy);
  }
  out.timeline = out.confirmed.filter((i) => i.sourceType === "sec" || i.sourceType === "ir").sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
  return out;
}
