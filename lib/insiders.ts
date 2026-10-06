import "server-only";
import { cache } from "./cache";
import { buildSecBundle, loadSecBundle, type SecBundle } from "./sources/sec";
import { personKey } from "./people";
import type { InsiderTxn, PersonKey, WireItem } from "./types";
import { loadFundamentals, sharesOutstandingAsOf, type FactPoint, type Fundamentals } from "./sources/xbrl";
import { makeHealth } from "./health";
import type { SourceHealth } from "./types";
import type { Sched13Parse } from "./sources/sec-13d";
import type { Holding } from "./sources/sec-form4";

export type InsiderFiling = {
  accession: string;
  form: string;
  filedAt: string;
  title: string;
  url: string;
  indexUrl: string;
  owners: { name: string; roles: string[] }[];
  people: PersonKey[];
  parseStatus: "ok" | "partial" | "failed" | "pending";
  txns: InsiderTxn[];
  holdings: Holding[];
  insiderClass?: WireItem["insiderClass"];
};

export type Sched13Row = {
  accession: string;
  form: string;
  filedAt: string;
  title: string;
  url: string;
  filer?: string;
  subject?: string;
  parse: Sched13Parse;
};

export type InsidersPayload = {
  filings: InsiderFiling[];
  sched13: Sched13Row[];
  health: SourceHealth;
  generatedAt: string;
  pendingNote?: string;
};

export function toInsiderPayload(b: SecBundle, health: SourceHealth, nowIso: string): InsidersPayload {
  const filings: InsiderFiling[] = b.forms345.map(({ row, item, parse }) => ({
    accession: row.accession,
    form: row.form,
    filedAt: row.publishedAt,
    title: item.title,
    url: item.url,
    indexUrl: item.altLinks?.[0]?.url ?? item.url,
    owners: (parse?.owners ?? []).map((o) => ({ name: o.name, roles: o.roles })),
    people: item.people,
    parseStatus: parse ? parse.status : "pending",
    txns: parse?.txns ?? [],
    holdings: parse?.holdings ?? [],
    insiderClass: item.insiderClass,
  }));
  const sched13: Sched13Row[] = b.sched13.map(({ row, item, parse }) => ({
    accession: row.accession, form: row.form, filedAt: row.publishedAt, title: item.title, url: item.url, filer: item.filer?.name, subject: item.subject?.name, parse,
  }));
  return { filings, sched13, health, generatedAt: nowIso, pendingNote: b.stats.pending > 0 ? `${b.stats.pending} filing document(s) still queued; the table fills in over the next refreshes` : undefined };
}

export async function getInsiders(opts: { force?: boolean } = {}): Promise<InsidersPayload> {
  const nowMs = Date.now();
  try {
    const r = await loadSecBundle({ force: opts.force });
    const b = r.value;
    const health = makeHealth({
      id: "sec", label: "SEC EDGAR", itemCount: b.forms345.length, nowMs,
      result: b.stale ? { fetchedAt: b.stale.fetchedAt, stale: true, error: b.stale.error, latencyMs: r.latencyMs } : r,
      attemptedAt: cache.lastAttemptAt("sec:bundle"),
    });
    return toInsiderPayload(r.value, health, new Date(nowMs).toISOString());
  } catch (e) {
    return { filings: [], sched13: [], health: makeHealth({ id: "sec", label: "SEC EDGAR", itemCount: 0, nowMs, error: e }), generatedAt: new Date(nowMs).toISOString() };
  }
}

// ---------------- RC tracker series ----------------

export type SharesPoint = {
  date: string; // transaction date
  sharesOwned: number;
  directIndirect: "D" | "I";
  nature?: string;
  accession: string;
  filingUrl: string;
  form: string;
  outstanding?: FactPoint; // share count used for the % (dated on/before `date`)
  pct: number | null;
};

export type BeneficialPoint = { date: string; pct: number | null; shares: number | null; accession: string; url: string; form: string; eventDate?: string };

export type RcSeries = { shares: SharesPoint[]; beneficial: BeneficialPoint[]; purchases: InsiderTxn[]; fundamentalsError?: string; sharesAmbiguous: boolean };

const isCommon = (t: InsiderTxn) => !t.isDerivative && /common|class a/i.test(t.securityTitle);

export function buildRcSeries(payload: InsidersPayload, f: Fundamentals | undefined): RcSeries {
  const rcFilings = payload.filings.filter((x) => x.people.includes("ryan_cohen"));
  const points: SharesPoint[] = [];
  const purchases: InsiderTxn[] = [];
  for (const fl of rcFilings) {
    for (const t of fl.txns) {
      if (t.code === "P") purchases.push(t);
      if (!isCommon(t) || t.sharesOwnedAfter === null || !t.date) continue;
      const out = f ? sharesOutstandingAsOf(f, t.date) : undefined;
      points.push({
        date: t.date, sharesOwned: t.sharesOwnedAfter, directIndirect: t.directIndirect, nature: t.natureOfOwnership, accession: fl.accession, filingUrl: fl.indexUrl, form: fl.form,
        outstanding: out, pct: out ? (t.sharesOwnedAfter / out.val) * 100 : null,
      });
    }
  }
  points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  purchases.sort((a, b) => (a.date < b.date ? -1 : 1));
  const beneficial: BeneficialPoint[] = payload.sched13
    .filter((r) => r.parse.persons.some((p) => personKey(p.name) === "ryan_cohen"))
    .flatMap((r) => {
      const p = r.parse.persons.find((x) => personKey(x.name) === "ryan_cohen")!;
      return [{ date: r.filedAt.slice(0, 10), pct: p.percentOfClass, shares: p.aggregateShares, accession: r.accession, url: r.url, form: r.form, eventDate: r.parse.dateOfEvent }];
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  return { shares: points, beneficial, purchases, sharesAmbiguous: !!f?.shares.ambiguous };
}

export async function getRcSeries(): Promise<{ payload: InsidersPayload; series: RcSeries; fundamentals?: Fundamentals }> {
  const payload = await getInsiders();
  let f: Fundamentals | undefined;
  let err: string | undefined;
  try {
    f = (await loadFundamentals()).value;
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }
  const series = buildRcSeries(payload, f);
  series.fundamentalsError = err;
  return { payload, series, fundamentals: f };
}

export { buildSecBundle };
