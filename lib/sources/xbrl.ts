import "server-only";
/** XBRL companyfacts (SPEC §7.4). Tags are discovered from the data, never assumed. */
import { z } from "zod";
import { cache } from "../cache";
import { GME } from "../config/watch";
import { secJson } from "../http";
import { cikNoZeros, indexUrl, padCik } from "../sec-forms";

const Fact = z.object({
  end: z.string(),
  val: z.number(),
  accn: z.string(),
  form: z.string(),
  filed: z.string(),
  start: z.string().optional(),
  fy: z.number().nullish(),
  fp: z.string().nullish(),
});
const Concept = z.object({ label: z.string().nullish(), units: z.record(z.string(), z.array(Fact)) });
const CompanyFacts = z.object({ entityName: z.string().optional(), facts: z.record(z.string(), z.record(z.string(), Concept)) });
export type CompanyFactsT = z.infer<typeof CompanyFacts>;

export type FactPoint = { tag: string; taxonomy: string; unit: string; end: string; val: number; form: string; filed: string; accn: string; fy?: number | null; fp?: string | null; url: string };

export type ConceptSeries = { id: string; label: string; tagsConsidered: string[]; tagsFound: string[]; series: FactPoint[]; status: "ok" | "not_tagged" };
export type Fundamentals = {
  entityName?: string;
  shares: { series: FactPoint[]; ambiguous: boolean };
  concepts: ConceptSeries[];
  fetchedAt: string;
};

const REPORT_FORMS = new Set(["10-Q", "10-K", "10-K/A", "10-Q/A", "10-KT"]);

const CONCEPTS: { id: string; label: string; tags: string[]; discover?: RegExp }[] = [
  { id: "cash", label: "Cash & cash equivalents", tags: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"] },
  { id: "securities", label: "Marketable securities / short-term investments", tags: ["MarketableSecuritiesCurrent", "ShortTermInvestments", "AvailableForSaleSecuritiesDebtSecuritiesCurrent", "MarketableSecurities"] },
  { id: "debt", label: "Debt / convertible notes", tags: ["ConvertibleNotesPayable", "ConvertibleNotesPayableNoncurrent", "ConvertibleDebt", "ConvertibleDebtNoncurrent", "LongTermDebt", "LongTermDebtNoncurrent", "DebtInstrumentCarryingAmount", "NotesPayable"] },
  { id: "crypto", label: "Crypto / Bitcoin", tags: ["CryptoAssetFairValue", "CryptoAssetFairValueNonCurrent", "CryptoAssetNumberOfUnits"], discover: /crypto|bitcoin|digitalasset/i },
];

function accnUrl(accn: string): string {
  return indexUrl(cikNoZeros(GME.cik), accn);
}

export function toPoints(taxonomy: string, tag: string, c: z.infer<typeof Concept>, instantOnly: boolean): FactPoint[] {
  const out: FactPoint[] = [];
  for (const [unit, facts] of Object.entries(c.units)) {
    for (const f of facts) {
      if (instantOnly && f.start) continue;
      out.push({ tag, taxonomy, unit, end: f.end, val: f.val, form: f.form, filed: f.filed, accn: f.accn, fy: f.fy, fp: f.fp, url: accnUrl(f.accn) });
    }
  }
  return out;
}

/** latest-filed value per period end, newest period first */
function latestPerEnd(points: FactPoint[]): FactPoint[] {
  const by = new Map<string, FactPoint>();
  for (const p of points) {
    const k = `${p.tag}|${p.end}`;
    const cur = by.get(k);
    if (!cur || p.filed > cur.filed) by.set(k, p);
  }
  return [...by.values()].sort((a, b) => (a.end < b.end ? 1 : -1));
}

export function extractFundamentals(raw: unknown, nowIso: string): Fundamentals {
  const cf = CompanyFacts.parse(raw);
  const out: Fundamentals = { entityName: cf.entityName, shares: { series: [], ambiguous: false }, concepts: [], fetchedAt: nowIso };

  const dei = cf.facts["dei"]?.["EntityCommonStockSharesOutstanding"];
  if (dei) {
    const pts = toPoints("dei", "EntityCommonStockSharesOutstanding", dei, false);
    // several values for the same filing means several share classes: companyfacts doesn't say which — don't guess
    const perAccn = new Map<string, Set<number>>();
    for (const p of pts) (perAccn.get(p.accn) ?? perAccn.set(p.accn, new Set()).get(p.accn)!).add(p.val);
    const clean = pts.filter((p) => (perAccn.get(p.accn)?.size ?? 0) === 1);
    out.shares = { series: latestPerEnd(clean), ambiguous: clean.length !== pts.length };
  }

  for (const c of CONCEPTS) {
    const found: string[] = [];
    const considered = [...c.tags];
    const all: FactPoint[] = [];
    const scan = (tax: string, tag: string) => {
      const concept = cf.facts[tax]?.[tag];
      if (!concept) return;
      const pts = toPoints(tax, tag, concept, true).filter((p) => REPORT_FORMS.has(p.form) && p.unit !== "shares" && p.unit !== "pure");
      if (pts.length) {
        found.push(`${tax}:${tag}`);
        all.push(...pts);
      }
    };
    for (const tag of c.tags) scan("us-gaap", tag);
    if (c.discover) {
      for (const [tax, tags] of Object.entries(cf.facts)) {
        for (const tag of Object.keys(tags)) {
          if (c.discover.test(tag) && !c.tags.includes(tag)) {
            considered.push(`${tax}:${tag}`);
            scan(tax, tag);
          }
        }
      }
    }
    // Series per tag; the "primary" tag is the one with the newest data (ties: first listed)
    const byTag = new Map<string, FactPoint[]>();
    for (const p of all) (byTag.get(`${p.taxonomy}:${p.tag}`) ?? byTag.set(`${p.taxonomy}:${p.tag}`, []).get(`${p.taxonomy}:${p.tag}`)!).push(p);
    const series = [...byTag.values()].flatMap((pts) => latestPerEnd(pts).slice(0, 6)).sort((a, b) => (a.end < b.end ? 1 : a.end > b.end ? -1 : a.tag.localeCompare(b.tag)));
    out.concepts.push({ id: c.id, label: c.label, tagsConsidered: considered, tagsFound: found, series, status: series.length ? "ok" : "not_tagged" });
  }
  return out;
}

export async function loadFundamentals(opts: { force?: boolean } = {}) {
  return cache.get(
    "xbrl:facts",
    6 * 3600_000,
    async () => extractFundamentals(await secJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${padCik(GME.cik)}.json`, { timeoutMs: 8000 }), new Date().toISOString()),
    { force: opts.force },
  );
}

/** latest shares-outstanding fact dated on or before `date` (YYYY-MM-DD) */
export function sharesOutstandingAsOf(f: Fundamentals, date: string): FactPoint | undefined {
  if (f.shares.ambiguous && f.shares.series.length === 0) return undefined;
  return f.shares.series.find((p) => p.end <= date);
}
