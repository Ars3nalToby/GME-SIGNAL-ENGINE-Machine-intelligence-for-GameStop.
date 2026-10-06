import type { WireItem } from "./types";
import type { Tier } from "./config/publishers";
import { fmtBrisbane, fmtDateOnly } from "./time";

/** absolute time for an item: Brisbane clock time, or just the date when the source had no time */
export const fmtWhen = (i: Pick<WireItem, "publishedAt" | "dateOnly">, withYear = false) => (i.dateOnly ? fmtDateOnly(i.publishedAt) : fmtBrisbane(i.publishedAt, withYear));

/** short label for the "form / type" column */
export function kindLabel(i: WireItem): string {
  if (i.sourceType === "sec") {
    const f = i.form ?? "SEC";
    return /^\d+$/.test(f) ? `FORM ${f}` : f.toUpperCase();
  }
  if (i.sourceType === "ir") return i.via ? "PRESS REL." : "IR";
  if (i.sourceType === "x") return i.tags.includes("Reply") ? "X REPLY" : i.tags.includes("Repost") ? "X REPOST" : "X POST";
  const t = (i.newsTier ?? "t3") as Tier;
  return t === "opinion" ? "OPINION" : `NEWS ${t.toUpperCase()}`;
}

export function sourceShort(i: WireItem): string {
  if (i.sourceType === "sec") return "SEC";
  if (i.sourceType === "ir") return "IR";
  if (i.sourceType === "x") return `X @${i.handle ?? ""}`;
  return (i.outlet ?? "NEWS").slice(0, 18);
}

export const fmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 0 }));
export const fmtUsd = (n: number | null | undefined, d = 2) => (n == null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`);
export const fmtPct = (n: number | null | undefined, d = 2) => (n == null ? "—" : `${n.toFixed(d)}%`);

/** per-share price: at least 2 decimals, up to 4 when the filing carries more precision (never rounds away digits) */
export function fmtPrice(n: number | null | undefined): string {
  if (n == null) return "—";
  const dec = (String(n).split(".")[1] ?? "").length;
  const d = Math.min(4, Math.max(2, dec));
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}
