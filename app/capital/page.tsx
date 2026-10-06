import { CompactItem, PageTitle } from "@/components/CompactItem";
import { buildFeed } from "@/lib/feed";
import { loadFundamentals } from "@/lib/sources/xbrl";
import { fmtBrisbane } from "@/lib/time";
import { fmtInt, fmtPct, fmtUsd } from "@/lib/format";
import { safeHref } from "@/lib/url";
import { parseCapital, newerFilingAvailable, sourcedPossibleShares, sourcedValue, type Instrument } from "@/lib/capital";
import raw from "@/data/capital-structure.json";

export const dynamic = "force-dynamic";

function Step({ label, node }: { label: string; node: React.ReactNode }) {
  return (
    <div className="min-w-[150px] flex-1 rounded border border-line bg-bg/60 p-3">
      <div className="panel-title">{label}</div>
      <div className="mono mt-1 text-[13px] font-semibold">{node}</div>
    </div>
  );
}

const Arrow = () => <div className="mono self-center text-muted max-lg:rotate-90" aria-hidden>→</div>;

function Field({ inst, field, fmt }: { inst: Instrument; field: string; fmt?: (v: never) => string }) {
  const f = sourcedValue<unknown>(inst as unknown as Instrument & Record<string, unknown>, field);
  if (f.unsourced) return <span className="text-red">UNSOURCED value withheld</span>;
  if (f.value == null) return <span className="text-amber">not verified</span>;
  const text = fmt ? (fmt as (v: unknown) => string)(f.value) : String(f.value);
  return (
    <span>
      {text}
      {f.src && <a className="link ml-1.5 text-[10px]" href={safeHref(f.src.url)} target="_blank" rel="noopener noreferrer" title={`${f.src.label}${f.src.section ? ` — ${f.src.section}` : ""} · ${f.src.accession}`}>[{f.src.label}] ↗</a>}
    </span>
  );
}

function Card({ inst, outstandingShares }: { inst: Instrument; outstandingShares: number | null }) {
  const sh = sourcedPossibleShares(inst);
  const usd = (v: number) => fmtUsd(v, 0);
  return (
    <section className="panel mb-4 p-4" aria-label={inst.name ?? "Instrument"}>
      <h3 className="text-[15px] font-semibold">{inst.name ?? "Unnamed instrument"} <span className="mono ml-2 text-[11px] text-muted">{inst.type ?? ""}</span></h3>
      <div className="mt-3 flex flex-wrap items-stretch gap-2">
        <Step label="Cash raised" node={<Field inst={inst} field="principal" fmt={usd} />} />
        <Arrow />
        <Step label="Debt outstanding" node={<><Field inst={inst} field="outstanding" fmt={usd} />{inst.outstandingAsOf ? <span className="text-muted"> as of <Field inst={inst} field="outstandingAsOf" /></span> : null}</>} />
        <Arrow />
        <Step label="Conversion conditions" node={<Field inst={inst} field="conversionConditions" />} />
        <Arrow />
        <Step label="Possible future shares (computed)" node={sh == null ? <span className="text-amber">not computable (needs sourced outstanding and conversion rate)</span> : <span>{fmtInt(sh)}{outstandingShares ? ` (${fmtPct((sh / outstandingShares) * 100)} of current shares)` : ""}</span>} />
      </div>
      <dl className="mono mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[11.5px] md:grid-cols-4">
        {([["Coupon", "coupon"], ["Maturity", "maturity"], ["Conversion rate (sh / $1,000)", "conversionRate"], ["Conversion price", "conversionPrice"], ["Capped call", "cappedCall"], ["Repurchases / redemptions", "repurchases"]] as [string, string][]).map(([k, f]) => (
          <div key={k}><dt className="text-muted">{k}</dt><dd><Field inst={inst} field={f} /></dd></div>
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
            <code className="mono">data/capital-structure.json</code> is empty on purpose: the figures have to be read from the 8-Ks (items 1.01 / 2.03), indenture exhibits and the latest 10-Q/10-K notes, and each value needs a source link. Candidate source filings found on the wire are listed below; add an instrument to the JSON, cite each field, and run <code className="mono">npm run verify:capital</code>.
          </p>
        </div>
      ) : (
        cap.instruments.map((i, n) => <Card key={n} inst={i} outstandingShares={outstanding} />)
      )}
      {cap.warrants && (() => {
        const W = cap.warrants;
        const o = sourcedValue<number>(W as never, "outstanding");
        const px = sourcedValue<number>(W as never, "exercisePrice");
        const r = sourcedValue<number>(W as never, "sharesPerWarrant");
        const link = (x: typeof o) => x.src && <a className="link ml-1 text-[10px]" href={safeHref(x.src.url)} target="_blank" rel="noopener noreferrer">[{x.src.label}] ↗</a>;
        return (
          <section className="panel mb-4 p-4" aria-label="Warrants">
            <h3 className="text-[15px] font-semibold">Warrants</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <Step label="Warrants outstanding" node={o.unsourced ? <span className="text-red">UNSOURCED value withheld</span> : o.value != null ? <span>{fmtInt(o.value)}{link(o)}</span> : <span className="text-amber">not verified</span>} />
              <Arrow />
              <Step label="Cash if all exercised (computed)" node={o.value != null && px.value != null ? <span>{fmtUsd(o.value * px.value, 0)}</span> : <span className="text-amber">not computable (needs sourced count and strike)</span>} />
              <Arrow />
              <Step label="Possible new shares (computed)" node={o.value != null && r.value != null ? <span>{fmtInt(o.value * r.value)}</span> : <span className="text-amber">not computable</span>} />
            </div>
          </section>
        );
      })()}
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
