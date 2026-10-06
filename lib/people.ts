import type { PersonKey } from "./types";

/** Identify the two tracked insiders by name (no hard-coded CIKs: none could be verified). */
export function personKey(name: string | undefined | null): PersonKey | undefined {
  if (!name) return undefined;
  const n = name.toLowerCase().replace(/[^a-z\s]/g, " ");
  const t = new Set(n.split(/\s+/).filter(Boolean));
  if (t.has("cohen") && (t.has("ryan") || t.has("r"))) return "ryan_cohen";
  if (t.has("cheng") && (t.has("larry") || t.has("lawrence"))) return "larry_cheng";
  return undefined;
}

export function peopleIn(text: string): PersonKey[] {
  const out: PersonKey[] = [];
  if (/\bryan\s+cohen\b|\bcohen\s+ryan\b/i.test(text)) out.push("ryan_cohen");
  if (/\blarry\s+cheng\b|\blawrence\s+cheng\b|\bcheng\s+lawrence\b/i.test(text)) out.push("larry_cheng");
  return out;
}

export const PERSON_LABEL: Record<PersonKey, string> = { ryan_cohen: "Ryan Cohen", larry_cheng: "Larry Cheng" };
export const PERSON_BADGE: Record<PersonKey, string> = { ryan_cohen: "RC", larry_cheng: "LC" };

/** "COHEN RYAN" / "Cohen Ryan" (EDGAR style "Last First") → "Ryan Cohen"; other all-caps names title-cased. */
export function prettyName(raw: string): string {
  const key = personKey(raw);
  if (key) return PERSON_LABEL[key];
  const s = raw.trim().replace(/\s+/g, " ");
  if (s === s.toUpperCase() || s === s.toLowerCase()) {
    return s
      .toLowerCase()
      .replace(/\b([a-z])([a-z']*)/g, (_, a: string, b: string) => a.toUpperCase() + b)
      .replace(/\bLlc\b/g, "LLC")
      .replace(/\bLp\b/g, "LP")
      .replace(/\bInc\b/g, "Inc")
      .replace(/\bCorp\b/g, "Corp");
  }
  return s;
}

/** Short display name for companies in titles: "GameStop Corp." → "GameStop". */
export function shortCompany(raw: string): string {
  const p = prettyName(raw);
  return p.replace(/,?\s+(Corp\.?|Corporation|Inc\.?|Incorporated|Co\.?|Company|Ltd\.?|PLC)$/i, "").trim() || p;
}
