import LineChart, { type Pt, type Series } from "@/components/LineChart";
import { PageTitle, SourceNote } from "@/components/CompactItem";
import { getRcSeries } from "@/lib/insiders";
import { fmtInt, fmtPct } from "@/lib/format";
import { safeHref } from "@/lib/url";
import { fmtBrisbane } from "@/lib/time";

export const dynamic = "force-dynamic";

const ts = (d: string) => Date.parse(`${d}T00:00:00Z`);

export default async function RcPage() {
  const { payload, series: s, fundamentals } = await getRcSeries();
  const D = s.shares.filter((p) => p.directIndirect === "D");
  const I = s.shares.filter((p) => p.directIndirect === "I");
  const tip = (p: (typeof s.shares)[number]) =>
    `${p.date}: ${fmtInt(p.sharesOwned)} shares (${p.directIndirect === "D" ? "direct" : "indirect"}${p.nature ? `, ${p.nature}` : ""}) — Form ${p.form}, accession ${p.accession}${p.outstanding ? ` · ${fmtPct(p.pct)} of ${fmtInt(p.outstanding.val)} shares outstanding as of ${p.outstanding.end} (${p.outstanding.form} filed ${p.outstanding.filed})` : " · % not computed (no share-count fact on/before this date)"}`;
  const sharesSeries: Series[] = [
    { id: "d", label: "Direct holdings (Form 4)", color: "#5aa7ff", points: D.map((p): Pt => ({ t: ts(p.date), v: p.sharesOwned, title: tip(p), href: p.filingUrl })) },
    { id: "i", label: "Indirect holdings (Form 4) — separate, never summed", color: "#ffbf5b", points: I.map((p): Pt => ({ t: ts(p.date), v: p.sharesOwned, title: tip(p), href: p.filingUrl })) },
  ].filter((x) => x.points.length);
  const pctSeries: Series[] = [
    { id: "dp", label: "Direct, computed %", color: "#5aa7ff", points: D.filter((p) => p.pct !== null).map((p): Pt => ({ t: ts(p.date), v: p.pct as number, title: tip(p), href: p.filingUrl })) },
    { id: "ip", label: "Indirect, computed %", color: "#ffbf5b", points: I.filter((p) => p.pct !== null).map((p): Pt => ({ t: ts(p.date), v: p.pct as number, title: tip(p), href: p.filingUrl })) },
  ].filter((x) => x.points.length);
  const benSeries: Series[] = [
    { id: "b", label: "Reported beneficial ownership % (Schedule 13D/A cover data)", color: "#e52436", points: s.beneficial.filter((b) => b.pct !== null).map((b): Pt => ({ t: ts(b.date), v: b.pct as number, title: `${b.date}: ${fmtPct(b.pct)} reported (${b.shares === null ? "shares UNPARSED" : `${fmtInt(b.shares)} sh`}) — ${b.form}, accession ${b.accession}${b.eventDate ? `, event date ${b.eventDate}` : ""}`, href: b.url })) },
  ].filter((x) => x.points.length);

  return (
    <div>
      <PageTitle title="RC TRACKER" sub="Ryan Cohen's stake from two separate sources. Nothing here comes from a finance-site percentage: shares from Form 4 filings, share counts from XBRL cover data, beneficial ownership from Schedule 13D/A cover data." />
      <SourceNote status={payload.health.status} note={payload.health.status === "live" ? payload.pendingNote : `SEC ${payload.health.status === "setup" ? "SETUP REQUIRED" : payload.health.status === "degraded" ? "serving stale data" : "unavailable"} — ${payload.health.lastError ?? ""}`} />

      <div className="panel mb-6 border-l-[3px] border-l-blue p-4 text-[13.5px] leading-relaxed">
        <b>Read this first.</b> The <i>number of shares owned</i> is not the <i>ownership percentage</i>. The percentage is shares ÷ shares outstanding, and shares outstanding changes: warrant exercises, convertible-note conversions and share offerings add new shares, which <b>dilutes the percentage even when Ryan Cohen buys more</b>. The 13D/A figure is a third thing — SEC beneficial ownership can include warrants and options exercisable within 60 days, so it is usually higher than shares actually held.
      </div>

      <section className="mb-8" aria-labelledby="sh">
        <h3 id="sh" className="panel-title mb-2">Series 1 · Shares owned (Form 4 “shares owned following transaction”, common stock)</h3>
        <div className="panel p-3"><LineChart series={sharesSeries} fmtY={(v) => fmtInt(v)} ariaLabel="Ryan Cohen shares owned over time, direct and indirect" /></div>
        {s.shares.length === 0 && <p className="mono mt-2 text-[12px] text-muted">No parsed Form 4 holdings for Ryan Cohen in the latest 60 insider filings (or they are still being parsed).</p>}
        <div className="panel scroll-x mt-3">
          <table className="dt min-w-[820px]">
            <thead><tr><th>Txn date</th><th className="text-right">Shares owned</th><th>D/I</th><th className="text-right">Computed %</th><th>Shares outstanding used (as-of)</th><th>Source</th></tr></thead>
            <tbody>
              {[...s.shares].reverse().map((p, i) => (
                <tr key={i}>
                  <td className="mono">{p.date}</td>
                  <td className="mono text-right">{fmtInt(p.sharesOwned)}</td>
                  <td>{p.directIndirect === "D" ? "Direct" : `Indirect${p.nature ? ` — ${p.nature}` : ""}`}</td>
                  <td className="mono text-right">{p.pct === null ? "not computed" : fmtPct(p.pct)}</td>
                  <td className="mono text-[12px]">{p.outstanding ? <>{fmtInt(p.outstanding.val)} as of {p.outstanding.end} <a className="link" href={safeHref(p.outstanding.url)} target="_blank" rel="noopener noreferrer">({p.outstanding.form})</a></> : <span className="text-amber">no dei:EntityCommonStockSharesOutstanding on/before this date</span>}</td>
                  <td><a className="link mono text-[11px]" href={safeHref(p.filingUrl)} target="_blank" rel="noopener noreferrer">Form {p.form} · {p.accession} ↗</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {s.fundamentalsError && <p className="mono mt-2 text-[12px] text-amber">Share-count facts unavailable ({s.fundamentalsError}) — computed % is not shown.</p>}
        {s.sharesAmbiguous && <p className="mono mt-2 text-[12px] text-amber">Some filings report several share counts without saying which class — those were excluded rather than guessed.</p>}
        {fundamentals && <p className="mono mt-2 text-[11px] text-muted">Latest share count on file: {fundamentals.shares.series[0] ? `${fmtInt(fundamentals.shares.series[0].val)} as of ${fundamentals.shares.series[0].end} (${fundamentals.shares.series[0].form}, filed ${fundamentals.shares.series[0].filed})` : "none found"} · fetched {fmtBrisbane(fundamentals.fetchedAt)}</p>}
      </section>

      {pctSeries.length > 0 && (
        <section className="mb-8" aria-labelledby="pc">
          <h3 id="pc" className="panel-title mb-2">Computed % of shares outstanding (shares owned ÷ latest share count dated on or before each point)</h3>
          <div className="panel p-3"><LineChart series={pctSeries} fmtY={(v) => fmtPct(v, 2)} ariaLabel="Computed ownership percentage over time" /></div>
        </section>
      )}

      <section className="mb-8" aria-labelledby="bn">
        <h3 id="bn" className="panel-title mb-2">Series 2 · Reported beneficial ownership % (Schedule 13D/A)</h3>
        <div className="panel p-3"><LineChart series={benSeries} fmtY={(v) => fmtPct(v, 1)} ariaLabel="Reported beneficial ownership percent from Schedule 13D amendments" /></div>
        <div className="panel scroll-x mt-3">
          <table className="dt min-w-[640px]">
            <thead><tr><th>Filed</th><th>Form</th><th className="text-right">Aggregate shares</th><th className="text-right">% of class</th><th>Event date</th><th>Source</th></tr></thead>
            <tbody>
              {s.beneficial.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted">No structured 13D/A filing by Ryan Cohen has been parsed yet. Older text/HTML 13Ds are linked, not parsed.</td></tr>}
              {[...s.beneficial].reverse().map((b) => (
                <tr key={b.accession}>
                  <td className="mono">{b.date}</td><td>{b.form}</td>
                  <td className="mono text-right">{b.shares === null ? "UNPARSED" : fmtInt(b.shares)}</td>
                  <td className="mono text-right">{b.pct === null ? "UNPARSED" : fmtPct(b.pct, 2)}</td>
                  <td className="mono">{b.eventDate ?? "—"}</td>
                  <td><a className="link mono text-[11px]" href={safeHref(b.url)} target="_blank" rel="noopener noreferrer">{b.accession} ↗</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
