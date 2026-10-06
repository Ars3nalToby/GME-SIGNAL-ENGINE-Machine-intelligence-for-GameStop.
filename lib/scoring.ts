/**
 * Deterministic, explainable signal scoring (SPEC §8). Score = information relevance, NOT price direction.
 * Recency never changes a score. Keywords can never change a credibility class.
 */
import type { PersonKey } from "./types";
import { signalOf } from "./types";
import { ITEM_8K, is13D, is13G, isAmendment } from "./sec-forms";
import type { Tier } from "./config/publishers";

export type Scored = { score: number; signal: "high" | "medium" | "low"; reasons: string[] };

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const finish = (score: number, reasons: string[]): Scored => {
  const s = clamp(Math.round(score), 0, 99);
  return { score: s, signal: signalOf(s), reasons };
};

// ---------------- keyword groups ----------------
type Group = { id: string; label: string; boost: number; re: RegExp };

const GROUPS: Group[] = [
  { id: "ma", label: "M&A", boost: 10, re: /\b(acquir(?:e|es|ed|ing)|acquisitions?|mergers?|tender offers?|business combinations?|takeovers?|ebay)\b/i },
  {
    id: "capital",
    label: "Capital",
    boost: 8,
    re: /\b(convertibles?|capital raise|at-the-market|dilution|(?:equity|stock|share|note|debt)s? offerings?|shelf registration|prospectus)\b/i,
  },
  { id: "warrants", label: "Warrants", boost: 8, re: /\bwarrants?\b/i },
  {
    id: "insider",
    label: "Insider",
    boost: 8,
    re: /\b(form 4|13D|insider (?:purchases?|buy|buys|buying|bought|sales?|sells|selling)|beneficial owner)/i,
  },
  { id: "treasury", label: "Treasury", boost: 6, re: /\b(bitcoin|treasury|buybacks?|repurchases?)\b/i },
  { id: "results", label: "Results", boost: 6, re: /\b(earnings|quarterly results|preliminary results|guidance)\b/i },
  { id: "people", label: "People", boost: 5, re: /\b(ryan cohen|larry cheng)\b/i },
  { id: "roles", label: "Role", boost: 3, re: /\b(ceo|chief executive|board of directors)\b/i },
];
// case-sensitive extras (uppercase tickers/acronyms only)
const CASE_SENSITIVE: { group: string; re: RegExp }[] = [
  { group: "capital", re: /\bATM\b/ },
  { group: "treasury", re: /\bBTC\b/ },
];

export const KEYWORD_CAP = 20;

export function keywordBoost(text: string): { boost: number; reasons: string[]; hits: Set<string> } {
  const hits = new Set<string>();
  const reasons: string[] = [];
  let total = 0;
  for (const g of GROUPS) {
    const matched = g.re.test(text) || CASE_SENSITIVE.some((c) => c.group === g.id && c.re.test(text));
    if (matched) {
      hits.add(g.id);
      total += g.boost;
      reasons.push(`${g.label} keyword +${g.boost}`);
    }
  }
  const boost = Math.min(total, KEYWORD_CAP);
  if (total > KEYWORD_CAP) reasons.push(`keyword boost capped at +${KEYWORD_CAP}`);
  return { boost, reasons, hits };
}

const PENALTIES = [/should you buy/i, /better buy/i, /too late to buy/i, /millionaire/i, /prediction/i, /\b\d+\s+reasons\b/i, /stocks? to buy/i];
const SCOOP = /\b(exclusive|sources said|sources say|people familiar)\b/i;

// ---------------- SEC ----------------
export type Form4Summary = {
  parsed: boolean;
  owners: PersonKey[];
  hasP: boolean;
  hasRcP: boolean;
  hasWarrantEx: boolean;
  hasRcWarrantEx: boolean;
  hasS: boolean;
  hasMX: boolean;
  routineOnly: boolean;
  codes: string[];
};

export type SecScoreInput = {
  form: string;
  items8k?: string[];
  form4?: Form4Summary;
  filerPerson?: PersonKey; // 13D family: filer is a tracked person
  subjectIsCounterparty?: boolean; // 13D family: subject is a watched counterparty (e.g. eBay)
  /** text used only for the 424B/S-3 "notes/offering/warrants" rule and 8-K item hints */
  text?: string;
};

const ITEM_95 = new Set(["1.01", "1.02", "2.01", "2.03", "3.02", "3.03", "5.01"]);

export function scoreSec(i: SecScoreInput): Scored {
  const form = i.form.trim();
  const F = form.toUpperCase();
  const r: string[] = [];

  if (/^4(\/A)?$/.test(F) || /^3(\/A)?$/.test(F) || /^5(\/A)?$/.test(F)) {
    const kind = F.replace(/\/A$/, "");
    if (kind === "3") return finish(60, ["Form 3 → 60"]);
    if (kind === "5") return finish(60, ["Form 5 → 60"]);
    const s = i.form4;
    if (!s || !s.parsed) return finish(80, ["Form 4 · unparsed (open filing) → 80"]);
    const cands: [number, string][] = [];
    const rc = s.owners.includes("ryan_cohen");
    const lc = s.owners.includes("larry_cheng");
    if (s.hasRcP) cands.push([98, "Form 4 · Ryan Cohen · code P → 98"]);
    if (s.hasRcWarrantEx) cands.push([95, "Form 4 · Ryan Cohen · warrant exercise → 95"]);
    if (s.hasP) cands.push([92, "Form 4 · insider purchase (code P) → 92"]);
    if (rc) cands.push([88, "Form 4 · Ryan Cohen · other → 88"]);
    if (s.hasS) cands.push([82, "Form 4 · insider sale (code S) → 82"]);
    if (lc) cands.push([78, "Form 4 · Larry Cheng · other → 78"]);
    if (s.hasMX) cands.push([72, "Form 4 · exercise/conversion (M/X) → 72"]);
    if (s.routineOnly) cands.push([62, "Form 4 · routine only (A/F/G/D) → 62"]);
    if (cands.length === 0) cands.push([70, `Form 4 · other code (${s.codes.join(",") || "?"}) → 70`]);
    cands.sort((a, b) => b[0] - a[0]);
    const [score, why] = cands[0]!;
    return finish(score, [why]);
  }

  if (F === "8-K" || F === "8-K/A") {
    const items = i.items8k ?? [];
    let best = 76;
    let why = "8-K · other items → 76";
    for (const it of items) {
      let s = 76;
      if (ITEM_95.has(it)) s = 95;
      else if (it === "2.02") s = 92;
      else if (it === "5.02") s = 88;
      else if (it === "7.01" || it === "8.01") s = 82;
      if (s > best || (s === best && why.startsWith("8-K · other"))) {
        best = s;
        why = `8-K · item ${it}${ITEM_8K[it] ? ` ${ITEM_8K[it].short}` : ""} → ${s}`;
      }
    }
    if (items.length === 0) why = "8-K · items not listed → 76";
    r.push(why);
    return finish(best, r);
  }

  if (/^SC TO-[TIC](\/A)?$/.test(F) || /^SC 14D9(\/A)?$/.test(F) || /^425$/.test(F) || /^S-4(\/A)?$/.test(F)) return finish(95, [`${form} (tender offer / business combination) → 95`]);
  if (is13D(form)) {
    if (i.filerPerson === "ryan_cohen") return finish(96, [`${form} · filed by Ryan Cohen → 96`]);
    if (i.subjectIsCounterparty) return finish(96, [`${form} · subject is a watched counterparty → 96`]);
    return finish(92, [`${form} → 92`]);
  }
  if (["DEFC14A", "PREC14A", "DFAN14A"].includes(F)) return finish(90, [`${form} (contested proxy) → 90`]);
  if (/^10-[KQ](\/A)?$/.test(F)) return isAmendment(F) ? finish(72, [`${form} (amendment) → 72`]) : finish(88, [`${form} → 88`]);
  if (/^S-3(ASR)?(\/A)?$/.test(F) || /^424B\d$/.test(F)) {
    if (/^424B\d$/.test(F) && /\b(notes?|offering|warrants?)\b/i.test(i.text ?? "")) return finish(92, [`${form} mentions notes/offering/warrants → 92`]);
    return finish(86, [`${form} (registration / prospectus) → 86`]);
  }
  if (/^(DEF|PRE) 14A$/.test(F)) return finish(78, [`${form} → 78`]);
  if (F === "8-A12B" || F === "25-NSE") return finish(75, [`${form} → 75`]);
  if (F === "144" || F === "DEFA14A") return finish(70, [`${form} → 70`]);
  if (is13G(form)) return finish(62, [`${form} → 62`]);
  if (F === "S-8") return finish(58, ["S-8 → 58"]);
  if (F === "CORRESP" || F === "UPLOAD") return finish(55, [`${form} → 55`]);
  return finish(50, [`${form} (other) → 50`]);
}

// ---------------- IR ----------------
export function scoreIr(text: string): Scored {
  const k = keywordBoost(text);
  return finish(Math.min(86 + k.boost, 98), ["GameStop IR release base 86", ...k.reasons, "cap 98"]);
}

// ---------------- X ----------------
export function scoreX(handle: string, isReply: boolean, text: string): Scored {
  const h = handle.toLowerCase();
  let base: number, cap: number, label: string;
  if (h === "ryancohen") {
    base = isReply ? 78 : 86;
    cap = isReply ? 95 : 99;
    label = isReply ? "@ryancohen reply" : "@ryancohen original post";
  } else if (h === "larryvc") {
    base = 66; cap = 84; label = "@larryvc";
  } else if (h === "gamestop") {
    base = 52; cap = 80; label = "@gamestop";
  } else {
    base = 40; cap = 70; label = `@${h} (unlisted account)`;
  }
  const k = keywordBoost(text);
  return finish(Math.min(base + k.boost, cap), [`X ${label} base ${base}`, ...k.reasons, `cap ${cap}`]);
}

// ---------------- News ----------------
const NEWS: Record<Tier, { base: number; cap: number }> = {
  t1: { base: 50, cap: 88 },
  t2: { base: 44, cap: 80 },
  t3: { base: 36, cap: 74 },
  opinion: { base: 24, cap: 49 },
};

export function scoreNews(tier: Tier, text: string): Scored {
  const { base, cap } = NEWS[tier];
  const reasons = [`News ${tier.toUpperCase()} base ${base}`];
  const k = keywordBoost(text);
  reasons.push(...k.reasons);
  let score = base + k.boost;
  let scoop = false;
  if ((tier === "t1" || tier === "t2") && SCOOP.test(text) && k.hits.has("ma")) {
    score += 15;
    scoop = true;
    reasons.push("exclusive / sourced report on M&A +15");
  }
  if (PENALTIES.some((p) => p.test(text))) {
    score -= 12;
    reasons.push("clickbait / advice phrasing −12");
  }
  if (tier === "t1" && scoop) {
    if (score < 85) reasons.push("T1 sourced M&A report floored at 85");
    score = Math.max(score, 85);
  }
  if (score > cap) reasons.push(`cap ${cap}`);
  return finish(Math.min(score, cap), reasons);
}
