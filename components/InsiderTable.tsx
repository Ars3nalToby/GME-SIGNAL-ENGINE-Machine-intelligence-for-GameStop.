"use client";
import { useState } from "react";
import { safeHref } from "@/lib/url";

export type InsiderRow = {
  key: string;
  owner: string;
  roles: string;
  person?: "ryan_cohen" | "larry_cheng";
  codeLabel: string;
  code: string;
  isPurchase: boolean;
  isWarrantEx: boolean;
  security: string;
  derivative: boolean;
  date: string;
  filed: string;
  filedIso: string;
  shares: string;
  price: string;
  priceNote?: string;
  value: string;
  after: string;
  di: string;
  form: string;
  filingUrl: string;
  indexUrl: string;
  state: "ok" | "partial" | "unparsed" | "pending";
};

type F = "all" | "purchases" | "rc" | "lc";
const FILTERS: [F, string][] = [["all", "All"], ["purchases", "Purchases only"], ["rc", "Ryan Cohen"], ["lc", "Larry Cheng"]];

export default function InsiderTable({ rows }: { rows: InsiderRow[] }) {
  const [f, setF] = useState<F>("all");
  const shown = rows.filter((r) => (f === "all" ? true : f === "purchases" ? r.isPurchase : f === "rc" ? r.person === "ryan_cohen" : r.person === "larry_cheng"));
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="toolbar" aria-label="Insider filters">
        {FILTERS.map(([id, label]) => <button key={id} className="btn min-h-[40px]" aria-pressed={f === id} onClick={() => setF(id)}>{label}</button>)}
      </div>
      <div className="panel scroll-x">
        <table className="dt min-w-[980px]">
          <thead>
            <tr><th>Insider</th><th>Role</th><th>Transaction</th><th>Date</th><th className="text-right">Shares</th><th className="text-right">Price</th><th className="text-right">Value</th><th className="text-right">Holdings after</th><th>Filing</th></tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={9} className="py-8 text-center text-muted">No rows match. Nothing is shown unless it was parsed from a filing.</td></tr>}
            {shown.map((r) => (
              <tr key={r.key} className={r.person === "ryan_cohen" ? "border-l-2 border-l-red" : r.person === "larry_cheng" ? "border-l-2 border-l-amber" : ""}>
                <td className="font-medium">{r.owner}{r.person && <span className={`mono ml-2 rounded px-1 text-[10px] ${r.person === "ryan_cohen" ? "bg-red text-white" : "bg-amber text-bg"}`}>{r.person === "ryan_cohen" ? "RC" : "LC"}</span>}</td>
                <td className="text-muted">{r.roles || "—"}</td>
                {r.state === "unparsed" || r.state === "pending" ? (
                  <td colSpan={6} className="mono text-[12px] text-amber">{r.state === "pending" ? "DETAILS LOADING — open filing" : "UNPARSED — open filing"} <span className="text-muted">(filed {r.filed})</span></td>
                ) : (
                  <>
                    <td>
                      <span className={r.isWarrantEx ? "text-amber" : r.isPurchase ? "text-green" : ""}>{r.isWarrantEx ? "WARRANT EXERCISE" : r.codeLabel}</span>
                      <span className="mono ml-1.5 text-[10.5px] text-muted">code {r.code}</span>
                      <div className="mono text-[10.5px] text-muted">{r.security}{r.derivative ? " (derivative)" : ""}</div>
                    </td>
                    <td className="mono whitespace-nowrap">{r.date || "—"}</td>
                    <td className="mono text-right">{r.shares}</td>
                    <td className="mono text-right">
                      {r.price}
                      {r.priceNote && <div className="max-w-[220px] text-left text-[10.5px] leading-tight text-amber" title={r.priceNote}>avg — see footnote: {r.priceNote.slice(0, 120)}{r.priceNote.length > 120 ? "…" : ""}</div>}
                    </td>
                    <td className="mono text-right">{r.value}</td>
                    <td className="mono text-right">{r.after} <span className="text-muted">{r.after === "—" ? "" : `(${r.di === "D" ? "direct" : "indirect"})`}</span></td>
                  </>
                )}
                <td className="whitespace-nowrap">
                  <a className="link mono text-[11px]" href={safeHref(r.filingUrl)} target="_blank" rel="noopener noreferrer">FORM {r.form} ↗</a>
                  <a className="mono ml-2 text-[11px] text-muted hover:text-ink" href={safeHref(r.indexUrl)} target="_blank" rel="noopener noreferrer">index</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
