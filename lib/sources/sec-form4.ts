import "server-only";
/**
 * Forms 3/4/5 ownership-document parser (SPEC §7.2). Pure: XML string in, typed result out.
 * Values are never guessed: anything that is not a plain number becomes null and the row is `partial`.
 */
import type { InsiderTxn, PersonKey } from "../types";
import type { Form4Summary } from "../scoring";
import { asArray, makeParser, strictNum, txt } from "../xml";
import { personKey, prettyName } from "../people";
import { aggregate } from "../insider-math";

export const CODE_LABELS: Record<string, string> = {
  P: "Purchase",
  S: "Sale",
  A: "Grant / award",
  D: "Disposition to issuer",
  F: "Tax / exercise-price withholding",
  M: "Exercise / conversion (exempt)",
  X: "Exercise of derivative",
  C: "Conversion",
  G: "Gift",
  J: "Other",
};
export const codeLabel = (c: string) => CODE_LABELS[c] ?? (c ? `Code ${c}` : "Unknown");

export type OwnerInfo = { name: string; cik: string; roles: string[]; officerTitle?: string };
export type Holding = { ownerName: string; securityTitle: string; isDerivative: boolean; sharesOwned: number | null; directIndirect: "D" | "I"; nature?: string };

export type Form4Parse = {
  status: "ok" | "partial" | "failed";
  error?: string;
  documentType?: string;
  periodOfReport?: string;
  issuer: { cik?: string; name?: string; symbol?: string };
  owners: OwnerInfo[];
  txns: InsiderTxn[];
  holdings: Holding[];
};

const ARRAY_TAGS = [
  "reportingOwner", "nonDerivativeTransaction", "derivativeTransaction", "nonDerivativeHolding",
  "derivativeHolding", "footnote", "footnoteId",
];

const flag = (x: unknown) => /^(1|true)$/i.test(txt(x) ?? "");

function footnoteIds(node: unknown): string[] {
  if (!node || typeof node !== "object") return [];
  const n = node as Record<string, unknown>;
  const ids = asArray(n.footnoteId as unknown).map((f) => (typeof f === "object" && f ? String((f as Record<string, unknown>)["@_id"] ?? "") : "")).filter(Boolean);
  return ids;
}

export function parseOwnershipXml(xml: string, ctx: { accession: string; filingUrl: string; filedAt?: string }): Form4Parse {
  const empty: Form4Parse = { status: "failed", issuer: {}, owners: [], txns: [], holdings: [] };
  let doc: Record<string, unknown> | undefined;
  try {
    const root = makeParser(ARRAY_TAGS).parse(xml) as Record<string, unknown>;
    doc = root.ownershipDocument as Record<string, unknown> | undefined;
  } catch (e) {
    return { ...empty, error: `XML parse error: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!doc) return { ...empty, error: "no ownershipDocument element" };

  const footnotes: Record<string, string> = {};
  const fnRoot = doc.footnotes as Record<string, unknown> | undefined;
  for (const f of asArray(fnRoot?.footnote as unknown[])) {
    if (f && typeof f === "object") {
      const o = f as Record<string, unknown>;
      const id = String(o["@_id"] ?? "");
      const t = txt(o["#text"]);
      if (id && t) footnotes[id] = t.replace(/\s+/g, " ");
    } else if (typeof f === "string") {
      // footnote without id attribute: cannot be attached to a value; ignore
    }
  }
  const noteFor = (node: unknown): string | undefined => {
    const t = footnoteIds(node).map((id) => footnotes[id]).filter(Boolean);
    return t.length ? t.join(" ") : undefined;
  };

  const issuerNode = (doc.issuer ?? {}) as Record<string, unknown>;
  const issuer = { cik: txt(issuerNode.issuerCik), name: txt(issuerNode.issuerName), symbol: txt(issuerNode.issuerTradingSymbol) };

  const owners: OwnerInfo[] = asArray(doc.reportingOwner as unknown[]).map((o) => {
    const ro = o as Record<string, unknown>;
    const id = (ro.reportingOwnerId ?? {}) as Record<string, unknown>;
    const rel = (ro.reportingOwnerRelationship ?? {}) as Record<string, unknown>;
    const roles: string[] = [];
    const officerTitle = txt(rel.officerTitle);
    if (flag(rel.isDirector)) roles.push("Director");
    if (flag(rel.isOfficer)) roles.push(officerTitle || "Officer");
    if (flag(rel.isTenPercentOwner)) roles.push("10% owner");
    if (flag(rel.isOther)) roles.push(txt(rel.otherText) || "Other");
    return { name: prettyName(txt(id.rptOwnerName) ?? "Unknown"), cik: txt(id.rptOwnerCik) ?? "", roles, officerTitle };
  });

  const ownerName = owners.map((o) => o.name).join(" / ") || "Unknown";
  const ownerCik = owners[0]?.cik ?? "";
  const roles = [...new Set(owners.flatMap((o) => o.roles))];
  const officerTitle = owners.find((o) => o.officerTitle)?.officerTitle;

  const txns: InsiderTxn[] = [];
  const holdings: Holding[] = [];

  const parseTable = (rows: unknown[], isDerivative: boolean) => {
    for (const r of rows) {
      const row = r as Record<string, unknown>;
      const coding = (row.transactionCoding ?? {}) as Record<string, unknown>;
      const amounts = (row.transactionAmounts ?? {}) as Record<string, unknown>;
      const post = (row.postTransactionAmounts ?? {}) as Record<string, unknown>;
      const nature = (row.ownershipNature ?? {}) as Record<string, unknown>;
      const securityTitle = txt(row.securityTitle) ?? "Unknown security";
      const code = (txt(coding.transactionCode) ?? "").toUpperCase();
      const adRaw = (txt(amounts.transactionAcquiredDisposedCode) ?? "").toUpperCase();
      const acquiredDisposed: "A" | "D" = adRaw === "D" ? "D" : "A";
      const shares = strictNum(txt(amounts.transactionShares));
      const priceNode = amounts.transactionPricePerShare;
      const price = strictNum(txt(priceNode));
      const priceNote = noteFor(priceNode);
      const priceIsAverage = !!priceNote && /weighted[\s-]*average/i.test(priceNote);
      const date = txt(row.transactionDate) ?? "";
      const di = (txt(nature.directOrIndirectOwnership) ?? "D").toUpperCase() === "I" ? "I" : "D";
      const after = strictNum(txt(post.sharesOwnedFollowingTransaction));
      const natureOfOwnership = txt(nature.natureOfOwnership) ?? noteFor(nature.natureOfOwnership);
      const exercisePrice = isDerivative ? strictNum(txt(row.conversionOrExercisePrice)) : undefined;

      const needsPrice = code === "P" || code === "S";
      const required = !!code && !!date && adRaw !== "" && shares !== null && (!needsPrice || price !== null);
      const parseStatus: InsiderTxn["parseStatus"] = !code ? "failed" : required ? "ok" : "partial";

      const t: InsiderTxn = {
        ownerName,
        ownerCik,
        roles,
        officerTitle,
        securityTitle,
        isDerivative,
        code,
        codeLabel: codeLabel(code),
        acquiredDisposed,
        date,
        shares,
        pricePerShare: price,
        priceNote,
        value: shares !== null && price !== null ? Math.round(shares * price * 100) / 100 : null,
        sharesOwnedAfter: after,
        directIndirect: di,
        natureOfOwnership,
        accessionNumber: ctx.accession,
        filingUrl: ctx.filingUrl,
        parseStatus,
        isWarrant: isDerivative && /warrant/i.test(securityTitle),
        priceIsAverage,
        filedAt: ctx.filedAt,
      };
      if (exercisePrice !== undefined && exercisePrice !== null) t.exercisePrice = exercisePrice;
      txns.push(t);
    }
  };

  const ndt = doc.nonDerivativeTable as Record<string, unknown> | undefined;
  const dt = doc.derivativeTable as Record<string, unknown> | undefined;
  parseTable(asArray(ndt?.nonDerivativeTransaction as unknown[]), false);
  parseTable(asArray(dt?.derivativeTransaction as unknown[]), true);

  const parseHoldings = (rows: unknown[], isDerivative: boolean) => {
    for (const r of rows) {
      const row = r as Record<string, unknown>;
      const post = (row.postTransactionAmounts ?? {}) as Record<string, unknown>;
      const nature = (row.ownershipNature ?? {}) as Record<string, unknown>;
      holdings.push({
        ownerName,
        securityTitle: txt(row.securityTitle) ?? "Unknown security",
        isDerivative,
        sharesOwned: strictNum(txt(post.sharesOwnedFollowingTransaction)),
        directIndirect: (txt(nature.directOrIndirectOwnership) ?? "D").toUpperCase() === "I" ? "I" : "D",
        nature: txt(nature.natureOfOwnership),
      });
    }
  };
  parseHoldings(asArray(ndt?.nonDerivativeHolding as unknown[]), false);
  parseHoldings(asArray(dt?.derivativeHolding as unknown[]), true);

  const docType = txt(doc.documentType);
  const anyRows = txns.length + holdings.length > 0;
  const allOk = txns.every((t) => t.parseStatus === "ok");
  const status: Form4Parse["status"] = !anyRows || owners.length === 0 ? "partial" : allOk ? "ok" : "partial";
  return { status, documentType: docType, periodOfReport: txt(doc.periodOfReport), issuer, owners, txns, holdings };
}

// ---------------- classification ----------------

export type Form4Class = "purchase" | "sale" | "warrant_exercise" | "exercise" | "routine" | "other" | "unparsed";

const ROUTINE = new Set(["A", "F", "G", "D"]);
const isWarrantEx = (t: InsiderTxn) => !!t.isWarrant && (t.code === "X" || t.code === "M");

export function summarizeForm4(p: Form4Parse | undefined): Form4Summary {
  if (!p || p.status === "failed" || p.txns.length === 0) {
    const owners = (p?.owners ?? []).map((o) => personKey(o.name)).filter((x): x is PersonKey => !!x);
    return { parsed: false, owners, hasP: false, hasRcP: false, hasWarrantEx: false, hasRcWarrantEx: false, hasS: false, hasMX: false, routineOnly: false, codes: [] };
  }
  const owners = [...new Set(p.owners.map((o) => personKey(o.name)).filter((x): x is PersonKey => !!x))];
  const rc = owners.includes("ryan_cohen");
  const codes = [...new Set(p.txns.map((t) => t.code))];
  const hasP = p.txns.some((t) => t.code === "P");
  const hasWarrantEx = p.txns.some(isWarrantEx);
  return {
    parsed: true,
    owners,
    hasP,
    hasRcP: rc && hasP,
    hasWarrantEx,
    hasRcWarrantEx: rc && hasWarrantEx,
    hasS: p.txns.some((t) => t.code === "S"),
    hasMX: p.txns.some((t) => t.code === "M" || t.code === "X"),
    routineOnly: p.txns.every((t) => ROUTINE.has(t.code)),
    codes,
  };
}

export function classifyForm4(p: Form4Parse | undefined): Form4Class {
  if (!p || p.status === "failed" || p.txns.length === 0) return "unparsed";
  if (p.txns.some((t) => t.code === "P")) return "purchase";
  if (p.txns.some(isWarrantEx)) return "warrant_exercise";
  if (p.txns.some((t) => t.code === "S")) return "sale";
  if (p.txns.some((t) => t.code === "M" || t.code === "X")) return "exercise";
  if (p.txns.every((t) => ROUTINE.has(t.code))) return "routine";
  return "other";
}

const fmtInt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtUsd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

export function form4Title(form: string, p: Form4Parse | undefined, filer?: string): string {
  const f = form.replace(/\/A$/, "");
  const pretty = `FORM ${form}`;
  if (!p || p.status === "failed") return `${pretty}${filer ? ` · ${filer}` : ""} (unparsed — open filing)`;
  const name = p.owners.map((o) => o.name).join(" / ") || filer || "Unknown insider";
  if (f === "3") return `${pretty} · ${name} · initial ownership statement`;
  if (p.txns.length === 0 && f === "5") return `${pretty} · ${name} · annual statement`;
  if (p.txns.length === 0) return `${pretty} · ${name} (unparsed — open filing)`;

  const cls = classifyForm4(p);
  const parts: string[] = [];
  const priceText = (a: ReturnType<typeof aggregate>) =>
    a.avgPrice === null ? "" : a.anyAverage ? ` @ avg ${fmtUsd(a.avgPrice)} — see footnote` : a.single ? ` @ ${fmtUsd(a.avgPrice)}` : ` @ avg ${fmtUsd(a.avgPrice)}`;
  const buy = p.txns.filter((t) => t.code === "P");
  const sell = p.txns.filter((t) => t.code === "S");
  const wex = p.txns.filter(isWarrantEx);
  if (buy.length) {
    const a = aggregate(buy);
    parts.push(`PURCHASE ${a.shares === null ? "(shares unparsed)" : `${fmtInt(a.shares)} sh`}${priceText(a)}`);
  }
  if (wex.length) {
    const der = wex.filter((t) => t.isDerivative);
    const a = aggregate(der.length ? der : wex);
    const ex = der[0]?.exercisePrice;
    parts.push(`WARRANT EXERCISE ${a.shares === null ? "(count unparsed)" : `${fmtInt(a.shares)} warrants`}${ex ? ` @ ${fmtUsd(ex)} strike` : ""}`);
  }
  if (sell.length) {
    const a = aggregate(sell);
    parts.push(`SALE ${a.shares === null ? "(shares unparsed)" : `${fmtInt(a.shares)} sh`}${priceText(a)}`);
  }
  if (!parts.length) {
    if (cls === "exercise") parts.push("exercise / conversion (not a purchase)");
    else if (cls === "routine") parts.push("routine (grant / tax withholding)");
    else parts.push(`other (code ${[...new Set(p.txns.map((t) => t.code))].join(", ")})`);
  }
  return `${pretty} · ${name} · ${parts.join(" · ")}`;
}
