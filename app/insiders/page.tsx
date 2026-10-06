import InsiderTable, { type InsiderRow } from "@/components/InsiderTable";
import { PageTitle, SourceNote } from "@/components/CompactItem";
import { getInsiders } from "@/lib/insiders";
import { fmtInt, fmtPrice, fmtUsd } from "@/lib/format";
import { fmtBrisbane } from "@/lib/time";
import { personKey } from "@/lib/people";
import { safeHref } from "@/lib/url";

export const dynamic = "force-dynamic";

export default async function InsidersPage() {
  const p = await getInsiders();
  const rows: InsiderRow[] = [];
  for (const f of p.filings) {
    const person = f.people[0];
    const owner = f.owners.map((o) => o.name).join(" / ") || (f.parseStatus === "pending" ? "—" : "Unknown");
    const roles = [...new Set(f.owners.flatMap((o) => o.roles))].join(", ");
    const filed = fmtBrisbane(f.filedAt, true);
    if (f.txns.length === 0) {
      if (f.holdings.length === 0) {
        // nothing parsed (yet): an honest placeholder row linking the filing
        rows.push({
          key: `${f.accession}:0`, owner, roles, person, codeLabel: "", code: "", isPurchase: false, isWarrantEx: false, security: "", derivative: false, date: "", filed, shares: "—", price: "—", value: "—", after: "—", di: "D", form: f.form, filingUrl: f.url, indexUrl: f.indexUrl,
          state: f.parseStatus === "pending" ? "pending" : "unparsed",
        });
      } else {
        f.holdings.forEach((h, i) =>
          rows.push({
            key: `${f.accession}:h${i}`, owner, roles, person, codeLabel: "Holding reported", code: "—", isPurchase: false, isWarrantEx: false, security: h.securityTitle, derivative: h.isDerivative, date: "", filed, shares: "—", price: "—", value: "—", after: fmtInt(h.sharesOwned), di: h.directIndirect, form: f.form, filingUrl: f.url, indexUrl: f.indexUrl, state: "ok",
          }),
        );
      }
      continue;
    }
    f.txns.forEach((t, i) =>
      rows.push({
        key: `${f.accession}:${i}`, owner, roles, person: personKey(t.ownerName) ?? person, codeLabel: t.codeLabel, code: t.code,
        isPurchase: t.code === "P", isWarrantEx: !!t.isWarrant && (t.code === "X" || t.code === "M"), security: t.securityTitle, derivative: t.isDerivative, date: t.date, filed,
        shares: fmtInt(t.shares), price: t.pricePerShare === null ? (t.priceNote ? "see footnote" : "—") : fmtPrice(t.pricePerShare), priceNote: t.priceIsAverage ? t.priceNote : t.pricePerShare === null ? t.priceNote : undefined,
        value: t.value === null ? "—" : fmtUsd(t.value, 0), after: fmtInt(t.sharesOwnedAfter), di: t.directIndirect, form: f.form, filingUrl: f.url, indexUrl: f.indexUrl, state: t.parseStatus === "ok" ? "ok" : "partial",
      }),
    );
  }
  rows.sort((a, b) => (b.date || b.filed).localeCompare(a.date || a.filed));

  const rcBuys = p.filings.filter((f) => f.people.includes("ryan_cohen")).flatMap((f) => f.txns.filter((t) => t.code === "P").map((t) => ({ t, f }))).sort((a, b) => a.t.date.localeCompare(b.t.date));

  return (
    <div>
      <PageTitle title="INSIDERS" sub="Forms 3, 4 and 5 where GameStop is the issuer — the latest 60, parsed from each filing's XML (≤10 new documents per refresh). Values are shown only when parsed exactly; anything else says UNPARSED and links the filing. A warrant exercise is never a purchase." />
      <SourceNote status={p.health.status} note={p.health.status === "live" ? p.pendingNote : p.health.status === "setup" ? `SEC SETUP REQUIRED — ${p.health.lastError}` : `SEC ${p.health.status === "degraded" ? "serving stale data" : "unavailable"} — ${p.health.lastError ?? ""}`} />
      <InsiderTable rows={rows} />

      <section className="mt-8" aria-labelledby="rcp">
        <h3 id="rcp" className="panel-title mb-2">Ryan Cohen — open-market / private purchases (code P), chronological</h3>
        <div className="panel scroll-x">
          <table className="dt min-w-[640px]">
            <thead><tr><th>Date</th><th className="text-right">Shares</th><th className="text-right">Price</th><th className="text-right">Value</th><th className="text-right">Holdings after</th><th>Filing</th></tr></thead>
            <tbody>
              {rcBuys.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted">No parsed code-P transactions by Ryan Cohen in the latest 60 insider filings.</td></tr>}
              {rcBuys.map(({ t, f }, i) => (
                <tr key={`${f.accession}${i}`}>
                  <td className="mono">{t.date}</td>
                  <td className="mono text-right">{fmtInt(t.shares)}</td>
                  <td className="mono text-right">{fmtPrice(t.pricePerShare)}{t.priceIsAverage ? " avg" : ""}</td>
                  <td className="mono text-right">{t.value === null ? "—" : fmtUsd(t.value, 0)}</td>
                  <td className="mono text-right">{fmtInt(t.sharesOwnedAfter)} ({t.directIndirect})</td>
                  <td><a className="link mono text-[11px]" href={safeHref(f.url)} target="_blank" rel="noopener noreferrer">FORM {f.form} ↗</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="s13">
        <h3 id="s13" className="panel-title mb-2">Schedule 13D / 13G filings on the wire</h3>
        <ul className="panel divide-y divide-[#1a2030]">
          {p.sched13.length === 0 && <li className="p-4 text-center text-[12px] text-muted">No structured 13D/13G filings parsed yet.</li>}
          {p.sched13.map((s) => (
            <li key={s.accession} className="p-3 text-[13px]">
              <a className="font-medium hover:text-blue" href={safeHref(s.url)} target="_blank" rel="noopener noreferrer">{s.title} ↗</a>
              <div className="mono mt-0.5 text-[11px] text-muted">filed {fmtBrisbane(s.filedAt, true)} · event {s.parse.dateOfEvent ?? "UNPARSED"} · {s.parse.persons.map((x) => `${x.name}: ${x.aggregateShares === null ? "UNPARSED" : fmtInt(x.aggregateShares)} sh / ${x.percentOfClass === null ? "UNPARSED" : `${x.percentOfClass}%`}`).join(" · ") || "no reporting persons parsed"}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
