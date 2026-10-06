import "server-only";
/**
 * SEC EDGAR source (SPEC §7.1–7.3). Polls submissions JSON for GameStop + watched counterparties,
 * enriches filings (Form 3/4/5 XML, 13D/G XML, SGML header, 8-K Ex. 99.1) incrementally and caches every
 * filing document forever by accession. At most MAX_UNCACHED_PER_CYCLE documents are fetched per refresh.
 */
import { z } from "zod";
import { DateTime } from "luxon";
import { cache, ImmutableCache } from "../cache";
import { COUNTERPARTY_FALLBACK_CIKS, COUNTERPARTY_FORMS, GME } from "../config/watch";
import { getEnv, type Env } from "../config/env";
import { secHead, secJson, secText, SetupError, shortError } from "../http";
import { makeHealth } from "../health";
import {
  docUrl, folderJsonUrl, folderUrl, formLabel, headerTxtUrl, indexUrl, is13D, is13G, isAmendment,
  isOwnershipForm, isXmlDoc, needsDirection, padCik, parseItems, rawXmlName, title8k, ITEM_8K,
} from "../sec-forms";
import { filingDateToIso, inferAcceptanceZone, iso, parseAcceptance, type AcceptanceZone } from "../time";
import { peopleIn, personKey, PERSON_LABEL, shortCompany } from "../people";
import { scoreSec, type Form4Summary } from "../scoring";
import type { PersonKey, SourceResult, WireItem } from "../types";
import { classifyForm4, form4Title, parseOwnershipXml, summarizeForm4, type Form4Parse } from "./sec-form4";
import { filerSummary, parseSchedule13Xml, type Sched13Parse } from "./sec-13d";
import { directionFromHeader, parseSecHeader, type SecHeader } from "./sec-header";

export const MAX_UNCACHED_PER_CYCLE = 10;
export const FORM345_WINDOW = 60;
const FEED_ROWS_GME = 150;
const FEED_ROWS_COUNTERPARTY = 40;
const IMMUTABLE_REVALIDATE = 60 * 60 * 24 * 30;

// ---------------- submissions ----------------

const StrArr = z.array(z.string());
const SubmissionsSchema = z.object({
  name: z.string().optional(),
  filings: z.object({
    recent: z.object({
      accessionNumber: StrArr,
      form: StrArr,
      filingDate: StrArr,
      acceptanceDateTime: StrArr.optional(),
      items: StrArr.optional(),
      primaryDocument: StrArr.optional(),
      primaryDocDescription: StrArr.optional(),
      reportDate: StrArr.optional(),
    }),
  }),
});

export type SecRow = {
  listCik: string; // CIK whose list this row came from (10-digit)
  listName: string;
  counterparty?: string; // ticker when the list is a watched counterparty's
  accession: string;
  form: string;
  filingDate: string;
  acceptanceRaw?: string;
  items: string[];
  primaryDocument?: string;
  description?: string;
  reportDate?: string;
  publishedAt: string; // ISO UTC
  dateOnly?: boolean; // no acceptance time was available: only the filing date is known
};

export function parseSubmissions(json: unknown, listCik: string, counterparty?: string): { name: string; rows: Omit<SecRow, "publishedAt">[] } {
  const p = SubmissionsSchema.parse(json);
  const r = p.filings.recent;
  const rows = r.accessionNumber.map((accession, i) => ({
    listCik: padCik(listCik),
    listName: p.name ?? "",
    counterparty,
    accession,
    form: r.form[i] ?? "",
    filingDate: r.filingDate[i] ?? "",
    acceptanceRaw: r.acceptanceDateTime?.[i] || undefined,
    items: parseItems(r.items?.[i]),
    primaryDocument: r.primaryDocument?.[i] || undefined,
    description: r.primaryDocDescription?.[i] || undefined,
    reportDate: r.reportDate?.[i] || undefined,
  }));
  return { name: p.name ?? "", rows };
}

export function resolveRowTimes(rows: Omit<SecRow, "publishedAt">[], configured: Env["acceptanceTz"], nowMs: number): { rows: SecRow[]; zone: AcceptanceZone; basis: string } {
  const inferred = inferAcceptanceZone(rows.map((r) => r.acceptanceRaw).filter((x): x is string => !!x));
  const zone: AcceptanceZone = configured !== "auto" ? configured : inferred ?? "UTC";
  const basis = configured !== "auto" ? "configured" : inferred ? "inferred from EDGAR 06:00–22:00 ET window" : "UNVERIFIED (assumed UTC as labelled)";
  const out: SecRow[] = rows.map((r) => {
    let dt = r.acceptanceRaw ? parseAcceptance(r.acceptanceRaw, zone) : null;
    // a filing cannot be accepted in the future: if the chosen reading puts it ahead of now, use the other reading
    if (dt && dt.toMillis() > nowMs + 120_000) {
      const alt = parseAcceptance(r.acceptanceRaw!, zone === "UTC" ? "America/New_York" : "UTC");
      if (alt && alt.toMillis() <= nowMs + 120_000) dt = alt;
    }
    // still in the future under both readings ⇒ the stamp is unreliable: never show a filing from the future
    if (dt && dt.toMillis() > nowMs) dt = DateTime.fromMillis(nowMs, { zone: "UTC" });
    const publishedAt = dt ? iso(dt) : filingDateToIso(r.filingDate) ?? new Date(nowMs).toISOString();
    return { ...r, publishedAt, dateOnly: dt ? undefined : true };
  });
  return { rows: out, zone, basis };
}

// ---------------- counterparties ----------------

export type Counterparty = { ticker: string; cik: string; name: string };

const TickersSchema = z.record(z.string(), z.object({ cik_str: z.union([z.number(), z.string()]), ticker: z.string(), title: z.string() }));

export async function resolveCounterparties(env: Env, force = false): Promise<Counterparty[]> {
  let table: z.infer<typeof TickersSchema> | undefined;
  try {
    const r = await cache.get("sec:tickers", 24 * 3600_000, async () => TickersSchema.parse(await secJson("https://www.sec.gov/files/company_tickers.json", { revalidate: 86400 })), { force });
    table = r.value;
  } catch (e) {
    if (e instanceof SetupError) throw e;
    table = undefined; // fall back to config CIKs
  }
  const out: Counterparty[] = [];
  for (const t of env.counterpartyTickers) {
    const hit = table ? Object.values(table).find((x) => x.ticker.toUpperCase() === t) : undefined;
    if (hit) out.push({ ticker: t, cik: padCik(hit.cik_str), name: hit.title });
    else if (COUNTERPARTY_FALLBACK_CIKS[t]) out.push({ ticker: t, cik: COUNTERPARTY_FALLBACK_CIKS[t]!, name: t });
  }
  return out;
}

// ---------------- enrichment ----------------

type Enrichment =
  | { kind: "form4"; parse: Form4Parse }
  | { kind: "13"; parse: Sched13Parse | null; header?: SecHeader }
  | { kind: "header"; header: SecHeader }
  | { kind: "index"; ex99?: { name: string; url: string } };

export const docCache = new ImmutableCache<Enrichment>();

const EX99 = /(^|[^a-z0-9])(ex(hibit)?[-_ ]?99[-_.]?0?1)|d\w*ex0?99[-_.]?0?1/i;
const IndexSchema = z.object({ directory: z.object({ item: z.array(z.object({ name: z.string(), type: z.string().optional() })) }) });

export function findEx99(json: unknown, row: Pick<SecRow, "listCik" | "accession">): { name: string; url: string } | undefined {
  const parsed = IndexSchema.safeParse(json);
  if (!parsed.success) return undefined;
  const hit = parsed.data.directory.item.find((f) => /\.(htm|html|txt)$/i.test(f.name) && EX99.test(f.name));
  return hit ? { name: hit.name, url: folderUrl(row.listCik, row.accession, hit.name) } : undefined;
}

type Task = { key: string; priority: number; run: () => Promise<Enrichment> };

function tasksFor(row: SecRow, form345Window: Set<string>): Task[] {
  const F = row.form.trim();
  const tasks: Task[] = [];
  const xml = row.primaryDocument && isXmlDoc(row.primaryDocument) ? rawXmlName(row.primaryDocument) : undefined;
  if (is13D(F) || is13G(F)) {
    if (xml) {
      tasks.push({
        key: `13:${row.accession}`,
        priority: 0,
        run: async () => {
          const text = await secText(docUrl(row.listCik, row.accession, xml), { revalidate: IMMUTABLE_REVALIDATE });
          return { kind: "13", parse: parseSchedule13Xml(text) };
        },
      });
    } else {
      tasks.push({ key: `hdr:${row.accession}`, priority: 2, run: async () => ({ kind: "header", header: parseSecHeader(await secHead(headerTxtUrl(row.listCik, row.accession), 16_384, {})) }) });
    }
  } else if (isOwnershipForm(F) && form345Window.has(row.accession) && xml) {
    tasks.push({
      key: `f4:${row.accession}`,
      priority: 1,
      run: async () => {
        const text = await secText(docUrl(row.listCik, row.accession, xml), { revalidate: IMMUTABLE_REVALIDATE });
        return { kind: "form4", parse: parseOwnershipXml(text, { accession: row.accession, filingUrl: indexUrl(row.listCik, row.accession), filedAt: row.publishedAt }) };
      },
    });
  } else if (needsDirection(F)) {
    tasks.push({ key: `hdr:${row.accession}`, priority: 2, run: async () => ({ kind: "header", header: parseSecHeader(await secHead(headerTxtUrl(row.listCik, row.accession), 16_384, {})) }) });
  } else if (/^8-K/.test(F) && row.items.some((i) => ["2.02", "7.01", "8.01", "1.01", "2.03", "3.02"].includes(i))) {
    tasks.push({
      key: `idx:${row.accession}`,
      priority: 3,
      run: async () => {
        const json = await secJson(folderJsonUrl(row.listCik, row.accession), { revalidate: IMMUTABLE_REVALIDATE });
        return { kind: "index", ex99: findEx99(json, row) };
      },
    });
  }
  return tasks;
}

async function enrich(rows: SecRow[], form345Window: Set<string>): Promise<{ attempted: number; failed: number; pending: number; lastError?: string }> {
  const all = rows.flatMap((r) => tasksFor(r, form345Window)); // rows are newest-first
  const missing = all.filter((t) => !docCache.has(t.key)).sort((a, b) => a.priority - b.priority); // stable: keeps newest-first within a priority
  const batch = missing.slice(0, MAX_UNCACHED_PER_CYCLE);
  let failed = 0;
  let lastError: string | undefined;
  await Promise.all(
    batch.map(async (t) => {
      try {
        await docCache.getOrLoad(t.key, t.run);
      } catch (e) {
        failed++;
        lastError = shortError(e);
      }
    }),
  );
  return { attempted: batch.length, failed, pending: missing.length - batch.length, lastError };
}

// ---------------- item building ----------------

export type SecContext = { gmeCik: string; counterparties: Counterparty[]; nowIso: string; form345Window?: Set<string> };

type Built = { item: WireItem; form4?: Form4Parse; summary?: Form4Summary; sched13?: Sched13Parse };

const get = <K extends Enrichment["kind"]>(kind: K, key: string) => {
  const e = docCache.peek(key);
  return e && e.kind === kind ? (e as Extract<Enrichment, { kind: K }>) : undefined;
};

function entityName(cik: string, rawName: string, ctx: SecContext): string {
  const c = padCik(cik);
  if (c === ctx.gmeCik) return "GameStop";
  const cp = ctx.counterparties.find((x) => x.cik === c);
  if (cp && cp.name !== cp.ticker) return cp.name;
  const person = personKey(rawName);
  if (person) return PERSON_LABEL[person];
  return shortCompany(rawName);
}

export function buildSecItem(row: SecRow, ctx: SecContext): Built {
  const F = row.form.trim();
  const label = formLabel(F);
  const primary = row.primaryDocument ? docUrl(row.listCik, row.accession, row.primaryDocument) : indexUrl(row.listCik, row.accession);
  const altLinks: { label: string; url: string }[] = [{ label: "Filing index", url: indexUrl(row.listCik, row.accession) }];
  if (row.primaryDocument && isXmlDoc(row.primaryDocument) && rawXmlName(row.primaryDocument) !== row.primaryDocument) {
    altLinks.push({ label: "Raw XML", url: docUrl(row.listCik, row.accession, rawXmlName(row.primaryDocument)) });
  }
  const people: PersonKey[] = [];
  const tags = new Set<string>(["SEC", F.startsWith("SCHEDULE") || F.startsWith("SC ") ? F : /^\d+$/.test(F) ? `Form ${F}` : F]);
  if (row.counterparty) {
    const cp = ctx.counterparties.find((c) => c.ticker === row.counterparty);
    tags.add(cp && cp.name !== cp.ticker ? cp.name.replace(/\s+(inc|corp)\.?$/i, "") : row.counterparty);
  }
  const base: WireItem = {
    id: `sec:${row.accession}`,
    sourceType: "sec",
    source: "SEC EDGAR",
    credibility: "primary_filing",
    title: `${F} — ${label}`,
    summary: `${label}. Filed ${row.filingDate}.`,
    publishedAt: row.publishedAt,
    dateOnly: row.dateOnly,
    fetchedAt: ctx.nowIso,
    url: primary,
    altLinks,
    form: F,
    formLabel: label,
    accessionNumber: row.accession,
    people,
    tags: [],
    score: 0,
    signal: "low",
    scoreReasons: [],
  };

  let form4: Form4Parse | undefined;
  let summary: Form4Summary | undefined;
  let sched13: Sched13Parse | undefined;
  let scoreInput: Parameters<typeof scoreSec>[0] = { form: F, items8k: row.items, text: `${row.description ?? ""} ${row.items.join(" ")}` };

  if (isOwnershipForm(F)) {
    const enr = get("form4", `f4:${row.accession}`);
    form4 = enr?.parse;
    const inWindow = !ctx.form345Window || ctx.form345Window.has(row.accession) || row.listCik !== ctx.gmeCik;
    const pending = !enr && inWindow && !!row.primaryDocument && isXmlDoc(row.primaryDocument);
    const outside = !enr && !inWindow;
    summary = summarizeForm4(form4);
    base.insiderClass = pending ? "pending" : classifyForm4(form4);
    if (outside) {
      base.title = `FORM ${F} — not parsed (older than the latest ${FORM345_WINDOW} insider filings) — open filing`;
      base.summary = "Older insider filing: only the newest 60 are parsed. Open the filing for details.";
      base.parseNote = "unparsed";
    } else if (pending) {
      base.title = `FORM ${F} · details loading — open filing`;
      base.summary = "Insider filing on the wire; its XML is parsed in the background (≤10 documents per refresh).";
      base.parseNote = "pending";
    } else {
      base.title = form4Title(F, form4);
      base.summary = form4 && form4.status !== "failed" ? `${label} — GameStop insider filing. Parsed from the filing XML.` : `${label} filed with the SEC. Could not be parsed reliably — open the filing.`;
      if (form4 && form4.status === "partial") base.parseNote = "partial";
      if (!form4 || form4.status === "failed") base.parseNote = "unparsed";
    }
    if (form4) {
      base.insiderTxns = form4.txns;
      for (const o of form4.owners) {
        const k = personKey(o.name);
        if (k && !people.includes(k)) people.push(k);
      }
      if (form4.issuer.cik && padCik(form4.issuer.cik) !== ctx.gmeCik) base.title += ` (issuer: ${form4.issuer.name ?? form4.issuer.cik})`;
    }
    if (people.length === 0) for (const k of peopleIn(base.title)) people.push(k);
    base.author = form4?.owners.map((o) => o.name).join(" / ");
    tags.add("Insider");
    if (base.insiderClass === "warrant_exercise") tags.add("Warrants");
    scoreInput = { form: F, form4: summary };
  } else if (/^8-K/.test(F)) {
    base.title = title8k(row.items);
    base.items8k = row.items;
    base.summary = row.items.length ? row.items.map((i) => ITEM_8K[i]?.long ?? `Item ${i}`).join("; ") + "." : "Current report.";
    const idx = get("index", `idx:${row.accession}`);
    if (idx?.ex99) base.altLinks!.push({ label: "Press release (Ex. 99.1)", url: idx.ex99.url });
    if (row.items.includes("2.02")) tags.add("Earnings");
    if (row.items.some((i) => ["2.03", "3.02"].includes(i))) tags.add("Capital");
  } else if (is13D(F) || is13G(F)) {
    const enr = get("13", `13:${row.accession}`);
    const hdr = enr?.header ?? get("header", `hdr:${row.accession}`)?.header;
    sched13 = enr?.parse ?? undefined;
    let filerName: string | undefined;
    let subjectName: string | undefined;
    let subjectCik: string | undefined;
    let filerCik: string | undefined;
    if (sched13 && sched13.status !== "failed" && sched13.issuerName) {
      subjectName = sched13.issuerName;
      subjectCik = sched13.issuerCik ? padCik(sched13.issuerCik) : undefined;
      filerName = filerSummary(sched13);
      filerCik = sched13.filerCiks[0] ? padCik(sched13.filerCiks[0]) : undefined;
    } else if (hdr) {
      const d = directionFromHeader(hdr);
      subjectName = d.subject?.name;
      subjectCik = d.subject?.cik ? padCik(d.subject.cik) : undefined;
      filerName = d.filer?.name;
      filerCik = d.filer?.cik ? padCik(d.filer.cik) : undefined;
    }
    const filerKey = personKey(filerName);
    if (filerKey) people.push(filerKey);
    const sName = subjectName ? entityName(subjectCik ?? "", subjectName, ctx) : undefined;
    const fName = filerName ? (filerKey ? PERSON_LABEL[filerKey] : entityName(filerCik ?? "", filerName, ctx)) : undefined;
    const label13 = F;
    if (fName && sName) {
      base.title = `${label13} — ${fName}'s stake in ${sName}`;
      base.filer = { name: fName, cik: filerCik ?? "" };
      base.subject = { name: sName, cik: subjectCik ?? "" };
    } else if (!enr && !hdr && (row.primaryDocument ? isXmlDoc(row.primaryDocument) : true)) {
      base.title = `${label13} — beneficial ownership report (details loading — open filing)`;
      base.parseNote = "pending";
    } else {
      base.title = `${label13} — beneficial ownership report (filer/subject UNPARSED — open filing)`;
      base.parseNote = "unparsed";
    }
    if (sched13 && sched13.persons.length) {
      const bits = sched13.persons
        .filter((p) => p.aggregateShares !== null || p.percentOfClass !== null)
        .map((p) => `${p.name}: ${p.aggregateShares !== null ? `${p.aggregateShares.toLocaleString("en-US")} sh` : "shares UNPARSED"}${p.percentOfClass !== null ? ` · ${p.percentOfClass}% of class` : ""}`);
      base.summary = `Reported beneficial ownership${sched13.dateOfEvent ? ` (event date ${sched13.dateOfEvent})` : ""} — ${bits.join("; ")}. May include securities acquirable within 60 days; this is not the same as shares owned.`;
    } else base.summary = "Beneficial ownership report. Open the filing for details.";
    // only a *parsed* subject counts; a filing merely sitting in a counterparty's list could equally be filed by it
    const subjCounterparty = !!subjectCik && ctx.counterparties.some((c) => c.cik === subjectCik);
    scoreInput = { form: F, filerPerson: filerKey, subjectIsCounterparty: !!subjCounterparty };
    tags.add("Ownership");
    if (subjCounterparty) tags.add("M&A");
  } else if (needsDirection(F)) {
    const hdr = get("header", `hdr:${row.accession}`)?.header;
    const d = hdr ? directionFromHeader(hdr) : {};
    const fName = d.filer ? entityName(d.filer.cik, d.filer.name, ctx) : undefined;
    const sName = d.subject ? entityName(d.subject.cik, d.subject.name, ctx) : undefined;
    if (fName && sName && fName !== sName) base.title = `${F} — ${label}: ${fName} re ${sName}`;
    else if (fName) base.title = `${F} — ${label} (filed by ${fName})`;
    else base.title = hdr ? `${F} — ${label}` : `${F} — ${label}${row.counterparty ? ` (${row.counterparty} filing list)` : " (filer/subject loading)"}`;
    if (fName) base.filer = { name: fName, cik: d.filer?.cik ?? "" };
    if (sName) base.subject = { name: sName, cik: d.subject?.cik ?? "" };
    tags.add("M&A");
  } else {
    base.title = `${F} — ${label}`;
    if (/^424B|^S-3/i.test(F)) tags.add("Capital");
  }

  const text = `${base.title} ${row.description ?? ""}`;
  if (/\bwarrants?\b/i.test(text)) tags.add("Warrants");
  if (/\bbitcoin\b/i.test(text)) tags.add("Bitcoin");
  for (const k of peopleIn(text)) if (!people.includes(k)) people.push(k);
  for (const k of people) tags.add(PERSON_LABEL[k]);

  const sc = scoreSec(scoreInput);
  base.score = sc.score;
  base.signal = sc.signal;
  base.scoreReasons = sc.reasons;
  base.tags = [...tags];
  if (is13D(F) && isAmendment(F)) base.tags.push("Amendment");
  return { item: base, form4, summary, sched13 };
}

// ---------------- bundle ----------------

/** A Form 3/4/5 in the latest-60 window; `parse` is absent while its XML is still queued. */
export type ParsedFiling = { row: SecRow; item: WireItem; parse?: Form4Parse };
export type Parsed13 = { row: SecRow; item: WireItem; parse: Sched13Parse };

export type SecBundle = {
  items: WireItem[];
  rows: SecRow[];
  forms345: ParsedFiling[];
  sched13: Parsed13[];
  counterparties: Counterparty[];
  zone: AcceptanceZone;
  zoneBasis: string;
  stats: { attempted: number; failed: number; pending: number; lastError?: string };
  notes: string[];
  /** set when the GameStop submissions list itself is being served stale (inner stale-on-error) */
  stale?: { error: string; fetchedAt: number };
};

export async function buildSecBundle(env: Env, nowMs: number, force: boolean): Promise<SecBundle> {
  if (!env.secUserAgent) throw new SetupError("SEC_USER_AGENT not set");
  const gmeCik = padCik(GME.cik);
  const notes: string[] = [];

  const gmeJson = await cache.get("sec:sub:gme", 60_000, () => secJson(`https://data.sec.gov/submissions/CIK${gmeCik}.json`, { revalidate: 60 }), { force });
  const gme = parseSubmissions(gmeJson.value, gmeCik);

  let counterparties: Counterparty[] = [];
  try {
    counterparties = await resolveCounterparties(env, force);
  } catch (e) {
    notes.push(`counterparty lookup failed: ${shortError(e)}`);
  }
  const cpRows: Omit<SecRow, "publishedAt">[] = [];
  await Promise.all(
    counterparties.map(async (cp) => {
      try {
        const r = await cache.get(`sec:sub:${cp.cik}`, 60_000, () => secJson(`https://data.sec.gov/submissions/CIK${cp.cik}.json`, { revalidate: 60 }), { force });
        if (r.stale) notes.push(`${cp.ticker} filings STALE (${r.error})`);
        const p = parseSubmissions(r.value, cp.cik, cp.ticker);
        cpRows.push(...p.rows.filter((x) => COUNTERPARTY_FORMS.has(x.form.trim())).slice(0, FEED_ROWS_COUNTERPARTY));
      } catch (e) {
        notes.push(`${cp.ticker} filings unavailable: ${shortError(e)}`);
      }
    }),
  );

  const gmeRows = gme.rows.slice(0, FEED_ROWS_GME);
  const seen = new Set(gmeRows.map((r) => r.accession));
  const merged = [...gmeRows, ...cpRows.filter((r) => !seen.has(r.accession))];
  const timed = resolveRowTimes(merged, env.acceptanceTz, nowMs);
  const rows = timed.rows.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  if (timed.basis.startsWith("UNVERIFIED")) notes.push("SEC acceptance-time zone unverified");

  // Forms 3/4/5 window: latest 60 where GameStop's list is the source
  const form345 = rows.filter((r) => isOwnershipForm(r.form.trim()) && r.listCik === gmeCik).slice(0, FORM345_WINDOW);
  const window = new Set(form345.map((r) => r.accession));

  const stats = await enrich(rows, window);
  if (stats.failed) notes.push(`${stats.failed} filing document(s) failed: ${stats.lastError}`);

  const ctx: SecContext = { gmeCik, counterparties, nowIso: new Date(nowMs).toISOString(), form345Window: window };
  const built = rows.map((r) => ({ row: r, b: buildSecItem(r, ctx) }));
  const forms345: ParsedFiling[] = [];
  const sched13: Parsed13[] = [];
  for (const { row, b } of built) {
    if (window.has(row.accession)) forms345.push({ row, item: b.item, parse: b.form4 });
    if (b.sched13 && b.sched13.status !== "failed") sched13.push({ row, item: b.item, parse: b.sched13 });
  }
  const stale = gmeJson.stale ? { error: gmeJson.error ?? "refresh failed", fetchedAt: gmeJson.fetchedAt } : undefined;
  return { items: built.map((x) => x.b.item), rows, forms345, sched13, counterparties, zone: timed.zone, zoneBasis: timed.basis, stats, notes, stale };
}

export async function loadSecBundle(opts: { force?: boolean; nowMs?: number } = {}) {
  const env = getEnv();
  const nowMs = opts.nowMs ?? Date.now();
  return cache.get("sec:bundle", 60_000, () => buildSecBundle(env, nowMs, !!opts.force), { force: opts.force });
}

export async function loadSec(opts: { force?: boolean; nowMs?: number } = {}): Promise<SourceResult & { bundle?: SecBundle }> {
  const nowMs = opts.nowMs ?? Date.now();
  try {
    const r = await loadSecBundle(opts);
    const b = r.value;
    const notes = [...b.notes];
    if (b.stats.pending > 0) notes.push(`${b.stats.pending} filing document(s) queued — parsed ≤${MAX_UNCACHED_PER_CYCLE} per refresh`);
    notes.push(`times: ${b.zone} (${b.zoneBasis})`);
    return {
      items: b.items,
      bundle: b,
      health: makeHealth({
        id: "sec", label: "SEC EDGAR", itemCount: b.items.length, nowMs,
        result: b.stale ? { fetchedAt: b.stale.fetchedAt, stale: true, error: b.stale.error, latencyMs: r.latencyMs } : r,
        attemptedAt: cache.lastAttemptAt("sec:bundle"), note: notes.join(" · "),
      }),
    };
  } catch (e) {
    return { items: [], health: makeHealth({ id: "sec", label: "SEC EDGAR", itemCount: 0, nowMs, error: e, attemptedAt: nowMs }) };
  }
}

