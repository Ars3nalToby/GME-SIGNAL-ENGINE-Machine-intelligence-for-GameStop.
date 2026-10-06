import { CompactItem, PageTitle } from "@/components/CompactItem";
import { buildFeed } from "@/lib/feed";
import { loadFundamentals } from "@/lib/sources/xbrl";
import { fmtBrisbane } from "@/lib/time";
import { fmtInt, fmtPct, fmtUsd } from "@/lib/format";
import { safeHref } from "@/lib/url";
import { parseCapital, newerFilingAvailable, possibleShares, type Instrument } from "@/lib/capital";
import raw from "@/data/capital-structure.json";

export const dynamic = "force-dynamic";

function Step({ label, value, src }: { label: string; value: string; src?: { url: string; label: string } }) {
  return (
    <div className="min-w-[150px] flex-1 rounded border border-line bg-bg/60 p-3">
      <div className="panel-title">{label}</div>
      <div className="mono mt-1 text-[14px] font-semibold">{value}</div>
      {src && <a className="link mono text-[10.5px]" href={safeHref(src.url)} target="_blank" rel="noopener noreferrer">{src.label} ↗</a>}
    </div>
  );
}

const Arrow = () => <div className="mono self-center text-muted max-lg:rotate-90" aria-hidden>→</div>;

function Card({ inst, outstandingShares }: { inst: Instrument; outstandingShares: number | null }) {
  const src = (f: string) => inst.sources.find((s) => s.field === f);
  const sh = possibleShares(inst);
  return (
    <section className="panel mb-4 p-4" aria-label={inst.name ?? "Instrument"}>
      <h3 className="text-[15px] font-semibold">{inst.name ?? "Unnamed instrument"} <span className="mono ml-2 text-[11px] text-muted">{inst.type ?? ""}</span></h3>
      <div className="mt-3 flex flex-wrap items-stretch gap-2">
        <Step label="Cash raised" value={inst.principal != null ? fmtUsd(inst.principal, 0) : "not verified"} src={src("principal") && { url: src("principal")!.url, label: src("principal")!.label }} />
        <Arrow />
        <Step label="Debt outstanding" value={inst.outstanding != null ? `${fmtUsd(inst.outstanding, 0)}${inst.outstandingAsOf ? ` (as of ${inst.outstandingAsOf})` : ""}` : "not verified"} src={src("outstanding") && { url: src("outstanding")!.url, label: src("outstanding")!.label }} />
        <Arrow />
        <Step label="Conversion conditions" value={inst.conversionConditions ?? "not verified"} src={src("conversionConditions") && { url: src("conversionConditions")!.url, label: src("conversionConditions")!.label }} />
        <Arrow />
        <Step label="Possible future shares" value={sh == null ? "not computable" : `${fmtInt(sh)}${outstandingShares ? ` (${fmtPct((sh / outstandingShares) * 100)} of current shares)` : ""}`} />
      </div>
      <dl className="mono mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[11.5px] md:grid-cols-4">
        {([["Coupon", inst.coupon], ["Maturity", inst.maturity], ["Conversion rate (sh / $1,000)", inst.conversionRate], ["Conversion price", inst.conversionPrice], ["Capped call", inst.cappedCall], ["Repurchases / redemptions", inst.repurchases]] as [string, unknown][]).map(([k, v]) => (
          <div key={k}><dt className="text-muted">{k}</dt><dd>{v == null ? <span className="text-amber">not verified</span> : String(v)}</dd></div>
        ))}
      </dl>
      <p className="mono mt-2 text-[10.5px] text-muted">verified {inst.verifiedAt ? fmtBrisbane(inst.verifiedAt, true) : "never"} · mechanics only — no judgement implied</p>
    </section>
  );
}

export default async function CapitalPage() {
  const cap = parseCapital(raw);
  const feed = await buildFeed();
  let outstanding: number | null = null;
  try {
    outstanding = (await loadFundamentals()).value.shares.series[0]?.val ?? null;
  } catch {
    outstanding = null;
  }
  const latestPeriodic = feed.items.filter((i) => ["10-K", "10-Q", "10-K/A", "10-Q/A"].includes(i.form ?? "")).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0];
  const stale = newerFilingAvailable(cap.verifiedAt, latestPeriodic?.publishedAt);
  const sources = feed.items.filter((i) => i.sourceType === "sec" && (["10-K", "10-Q", "S-3", "S-3ASR", "S-4"].includes(i.form ?? "") || /^424B/.test(i.form ?? "") || (i.items8k ?? []).some((x) => ["1.01", "2.03", "3.02"].includes(x))));

  return (
    <div>
      <PageTitle title="CAPITAL STRUCTURE" sub="Convertible notes, warrants and other instruments — mechanics only. Every figure must come from a filing and carries its source; anything unverified stays blank rather than guessed." />
      {stale && <p className="mono mb-3 rounded border border-amber bg-panel px-3 py-2 text-[12px] text-amber" role="alert">NEWER FILING AVAILABLE — data may be stale ({latestPeriodic?.title}, filed {fmtBrisbane(latestPeriodic!.publishedAt, true)}; data verified {cap.verifiedAt ? fmtBrisbane(cap.verifiedAt, true) : "never"})</p>}
      {cap.instruments.length === 0 ? (
        <div className="panel mb-6 p-5">
          <p className="mono text-[13px] text-amber">NOT YET POPULATED</p>
          <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-muted">
            <code className="mono">data/capital-structure.json</code> is empty on purpose: the figures have to be read from the 8-Ks (items 1.01 / 2.03), indenture exhibits and the latest 10-Q/10-K notes, and each value needs a source link. This build environment could not reach sec.gov, so nothing was filled from memory. Candidate source filings found on the wire are listed below; add an instrument to the JSON, cite each field, and run <code className="mono">npm run verify:capital</code>.
          </p>
        </div>
      ) : (
        cap.instruments.map((i, n) => <Card key={n} inst={i} outstandingShares={outstanding} />)
      )}
      {cap.warrants && (
        <section className="panel mb-4 p-4" aria-label="Warrants">
          <h3 className="text-[15px] font-semibold">Warrants</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <Step label="Warrants outstanding" value={cap.warrants.outstanding != null ? fmtInt(cap.warrants.outstanding) : "not verified"} />
            <Arrow />
            <Step label="Cash if all exercised" value={cap.warrants.outstanding != null && cap.warrants.exercisePrice != null ? fmtUsd(cap.warrants.outstanding * cap.warrants.exercisePrice, 0) : "not computable"} />
            <Arrow />
            <Step label="Possible new shares" value={cap.warrants.outstanding != null && cap.warrants.sharesPerWarrant != null ? fmtInt(cap.warrants.outstanding * cap.warrants.sharesPerWarrant) : "not computable"} />
          </div>
        </section>
      )}
      <p className="mono mb-2 text-[11px] text-muted">Current shares outstanding (XBRL, latest dei fact): {outstanding ? fmtInt(outstanding) : "unavailable"}</p>

      <section className="mt-6" aria-labelledby="cand">
        <h3 id="cand" className="panel-title mb-2">Candidate source filings on the wire (8-K items 1.01 / 2.03 / 3.02, registrations, 10-Q / 10-K)</h3>
        <ul className="panel px-4">
          {sources.length === 0 && <li className="py-6 text-center text-[12px] text-muted">None on the wire right now (or SEC is unavailable).</li>}
          {sources.map((i) => <CompactItem key={i.id} item={i} />)}
        </ul>
      </section>
    </div>
  );
}
