import type { WireItem } from "./types";

export type FilterId = "all" | "sec" | "ir" | "people" | "news" | "saved";
export const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "ALL" },
  { id: "sec", label: "SEC" },
  { id: "ir", label: "GAMESTOP IR" },
  { id: "people", label: "RYAN / LARRY" },
  { id: "news", label: "NEWS" },
  { id: "saved", label: "★ SAVED" },
];

export function haystack(i: WireItem): string {
  return [i.title, i.summary, i.source, i.form, i.formLabel, i.author, i.handle, ...(i.tags ?? []), ...(i.items8k ?? []), i.outlet].filter(Boolean).join(" ").toLowerCase();
}

export function matchesQuery(i: WireItem, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const h = haystack(i);
  return terms.every((t) => h.includes(t));
}

/** RYAN / LARRY = their X posts and their SEC filings (not news that merely mentions them). */
export const isPeopleItem = (i: WireItem) => (i.sourceType === "x" || i.sourceType === "sec") && i.people.length > 0;

export function applyFilters(items: WireItem[], o: { filter: FilterId; highOnly: boolean; query: string; savedIds: Set<string>; saved: WireItem[] }): WireItem[] {
  let base = o.filter === "saved" ? o.saved : items;
  if (o.filter === "sec") base = base.filter((i) => i.sourceType === "sec");
  else if (o.filter === "ir") base = base.filter((i) => i.sourceType === "ir");
  else if (o.filter === "news") base = base.filter((i) => i.sourceType === "news");
  else if (o.filter === "people") base = base.filter(isPeopleItem);
  if (o.highOnly) base = base.filter((i) => i.signal === "high");
  if (o.query.trim()) base = base.filter((i) => matchesQuery(i, o.query));
  return base;
}
