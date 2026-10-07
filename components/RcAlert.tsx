"use client";
import type { WireItem } from "@/lib/types";
import { aggregate } from "@/lib/insider-math";
import { fmtInt, fmtUsd } from "@/lib/format";
import { safeHref } from "@/lib/url";
import { RelOnly } from "./Time";

const WEEK = 7 * 24 * 3600_000;

/** Ryan Cohen Form 4 with code P, or a warrant exercise, filed in the last 7 days. Parsed values only. */
export function rcAlertItems(items: WireItem[], nowMs: number): WireItem[] {
  return items.filter(
    (i) =>
      i.sourceType === "sec" &&
      i.people.includes("ryan_cohen") &&
      /^4(\/A)?$/.test(i.form ?? "") &&
      (i.insiderClass === "purchase" || i.insiderClass === "warrant_exercise") &&
      nowMs - Date.parse(i.publishedAt) <= WEEK,
  );
}

export default function RcAlert({ items, lastSeenAt }: { items: WireItem[]; lastSeenAt: number | null }) {
  if (items.length === 0) return null;
  return (
    <section className="mb-5 space-y-3" aria-label="Ryan Cohen alert">
      {items.slice(0, 3).map((i) => {
        const txns = i.insiderTxns ?? [];
        const purchase = i.insiderClass === "purchase";
        const rows = purchase ? txns.filter((t) => t.code === "P") : txns.filter((t) => t.isWarrant && t.isDerivative);
        const a = aggregate(rows);
        const strikes = new Set(rows.map((r) => r.exercisePrice ?? null));
        const strike = strikes.size === 1 && !strikes.has(null) ? (rows[0]!.exercisePrice as number) : null; // one common strike only
        const last = [...txns].reverse().find((t) => !t.isDerivative && t.sharesOwnedAfter !== null);
        const isNew = lastSeenAt !== null && Date.parse(i.publishedAt) > lastSeenAt;
        const cells: [string, string][] = purchase
          ? [["SHARES", a.shares === null ? "UNPARSED" : fmtInt(a.shares)], ["AVG PRICE", a.avgPrice === null ? "UNPARSED" : fmtUsd(a.avgPrice)], ["TOTAL COST", a.total === null ? "UNPARSED" : fmtUsd(a.total, 0)], ["HOLDINGS AFTER", last ? `${fmtInt(last.sharesOwnedAfter)} (${last.directIndirect === "D" ? "direct" : "indirect"})` : "UNPARSED"]]
          : [["WARRANTS EXERCISED", a.shares === null ? "UNPARSED" : fmtInt(a.shares)], ["EXERCISE PRICE", strike != null ? fmtUsd(strike) : "UNPARSED / mixed"], ["CASH COST", a.shares !== null && strike != null ? fmtUsd(a.shares * strike, 0) : "UNPARSED"], ["COMMON HOLDINGS AFTER", last ? `${fmtInt(last.sharesOwnedAfter)} (${last.directIndirect === "D" ? "direct" : "indirect"})` : "UNPARSED"]];
        return (
          <div key={i.id} className="panel relative overflow-hidden !border-red/40 p-5 md:p-6" style={{ background: "linear-gradient(135deg, rgba(229,36,54,0.16), rgba(255,255,255,0.015) 60%)" }}>
            <span aria-hidden className="pointer-events-none absolute -top-16 -left-10 h-40 w-40 rounded-full bg-red/25 blur-3xl" />
            <div className="mono flex flex-wrap items-center gap-3 text-[11px] tracking-[0.12em]">
              <span className="rounded-md bg-red px-2 py-0.5 font-bold text-white">RC</span>
              <span className="font-semibold">{purchase ? "RYAN COHEN · FORM 4 PURCHASE" : "RYAN COHEN · WARRANT EXERCISE (NOT A PURCHASE)"}</span>
              {isNew && <span className="rounded border border-red px-1.5 py-0.5 text-red">NEW</span>}
              <span className="ml-auto text-muted">filed <RelOnly iso={i.publishedAt} /></span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              {cells.map(([k, v]) => (
                <div key={k}>
                  <dt className="eyebrow">{k}</dt>
                  <dd className="display mt-1 text-[22px] tabular-nums md:text-[26px]">{v.split(" (")[0]}{v.includes(" (") && <span className="mono ml-1.5 text-[11px] font-normal tracking-normal text-muted">({v.split(" (")[1]}</span>}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <a className="mono text-[11px] tracking-[0.1em] text-ink underline decoration-red underline-offset-4" href={safeHref(i.url)} target="_blank" rel="noopener noreferrer">VIEW FORM 4 →</a>
              {i.insiderTxns?.some((t) => t.priceNote) && <span className="mono text-[11px] text-amber">avg — see footnote</span>}
            </div>
          </div>
        );
      })}
    </section>
  );
}
