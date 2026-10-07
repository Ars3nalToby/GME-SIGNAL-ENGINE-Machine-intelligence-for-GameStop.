import WarrantCountdown from "@/components/WarrantCountdown";
import { CompactItem, PageTitle } from "@/components/CompactItem";
import { buildFeed } from "@/lib/feed";
import { readPositionForRender } from "@/lib/config/position";
import { WARRANT_TERMS } from "@/lib/config/watch";
import { loadMarket, QUOTE_STALE_MS, warrantMath } from "@/lib/sources/market";
import { fmtBrisbane, fmtExpiryNY, parseDeadline } from "@/lib/time";
import { fmtInt, fmtUsd, fmtWhen, irPageProblem } from "@/lib/format";
import { safeHref } from "@/lib/url";

export const dynamic = "force-dynamic";

const ADJUST = /(warrants?[^.]{0,120}(adjust|exercise price|exercise rate|anti-dilution))|((adjust|exercise price|exercise rate|anti-dilution)[^.]{0,120}warrants?)/i;

export default async function WarrantsPage() {
  const feed = await buildFeed();
  const position = readPositionForRender();
  const m = await loadMarket();
  const price = WARRANT_TERMS.exercisePriceUsd;
  const rate = WARRANT_TERMS.sharesPerWarrant;
  const gme = m.snapshot?.gme?.price;
  const wq = m.snapshot?.warrant?.price ?? null;
  const math = gme != null ? warrantMath(gme, price, wq) : null;
  const related = feed.items.filter((i) => i.tags.includes("Warrants") || ["8-A12B", "25-NSE"].includes(i.form ?? "")).slice(0, 25);
  const irPage = feed.irPages?.warrants ?? [];

  return (
    <div>
      <PageTitle title="WARRANTS" sub={`${WARRANT_TERMS.symbol} — facts and mechanics only. Terms below are configuration, and the company may adjust them (anti-dilution, or by choice): always confirm against the IR page and the latest filing.`} />
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="panel p-4" aria-label="Expiry">
          <h3 className="panel-title mb-2">Expiry</h3>
          <WarrantCountdown big />
          <p className="mono mt-3 text-[11px] leading-relaxed text-muted">Legal expiry per config: {fmtExpiryNY()} (New York time). Broker and agent instruction deadlines are usually earlier — set them in POSITION_JSON → warrantDeadlines.</p>
        </section>
        <section className="panel p-4" aria-label="Terms">
          <h3 className="panel-title mb-2">Terms (config)</h3>
          <table className="dt"><tbody>
            <tr><td className="text-muted">Cash exercise price</td><td className="mono">{fmtUsd(price)}</td></tr>
            <tr><td className="text-muted">Shares per warrant</td><td className="mono">{rate}</td></tr>
            <tr><td className="text-muted">Trades as</td><td className="mono">{WARRANT_TERMS.symbol} (NYSE)</td></tr>
          </tbody></table>
          <p className="mono mt-2 text-[11px] text-amber">Terms may be adjusted. Source: <a className="link" href={safeHref(WARRANT_TERMS.termsUrl)} target="_blank" rel="noopener noreferrer">GameStop IR — warrant dividend page ↗</a></p>
        </section>
      </div>

      <section className="mt-6" aria-labelledby="mech">
        <h3 id="mech" className="panel-title mb-2">Mechanics for my warrants (computed from POSITION_JSON)</h3>
        {position.status !== "set" ? (
          <p className="panel p-4 text-[13px] text-muted">{position.status === "invalid" ? `${position.error}.` : position.status === "hidden" ? "Position hidden — this site has no DASHBOARD_PASSWORD, so personal holdings are not shown (set a password, or ALLOW_PUBLIC_POSITION=1 to opt in)." : "No position configured."} Set POSITION_JSON on the server (never committed) to see per-venue mechanics.</p>
        ) : (
          <div className="panel scroll-x">
            <table className="dt min-w-[700px]">
              <thead><tr><th>Venue</th><th className="text-right">Warrants</th><th className="text-right">Cash to exercise</th><th className="text-right">Shares received</th><th>Broker / agent cut-off</th></tr></thead>
              <tbody>
                {position.venues.map((v) => {
                  const w = position.warrants[v] ?? 0;
                  const d = parseDeadline(position.warrantDeadlines[v]);
                  return (
                    <tr key={v}>
                      <td>{v}</td><td className="mono text-right">{fmtInt(w)}</td><td className="mono text-right">{fmtUsd(w * price, 2)}</td><td className="mono text-right">{fmtInt(w * rate)}</td>
                      <td className="mono text-[12px]">{d ? fmtBrisbane(d.toUTC().toISO() ?? "", true) : <span className="text-amber">CUT-OFF NOT SET — confirm with {v}</span>}</td>
                    </tr>
                  );
                })}
                <tr className="font-semibold"><td>TOTAL</td><td className="mono text-right">{fmtInt(position.totalWarrants)}</td><td className="mono text-right">{fmtUsd(position.totalWarrants * price, 2)}</td><td className="mono text-right">{fmtInt(position.totalWarrants * rate)}</td><td /></tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6" aria-labelledby="mk">
        <h3 id="mk" className="panel-title mb-2">Market values</h3>
        <div className="panel p-4 text-[13px]">
          {!m.snapshot ? (
            <p className="mono text-amber">{m.health.status === "setup" ? "MARKET DATA NOT CONNECTED" : `Market data unavailable — ${m.health.lastError ?? "error"}`}</p>
          ) : gme == null ? (
            <p className="mono text-amber">{m.snapshot.provider}: no GME quote returned.</p>
          ) : (
            <table className="dt"><tbody>
              <tr><td className="text-muted">GME ({m.snapshot.provider}{m.snapshot.gme?.asOf ? `, as of ${fmtBrisbane(m.snapshot.gme.asOf)}` : ""})</td><td className="mono text-right">{fmtUsd(gme)}</td></tr>
              <tr><td className="text-muted">Intrinsic value per warrant = max(0, GME − strike)</td><td className="mono text-right">{fmtUsd(math!.intrinsic)}</td></tr>
              {position.status === "set" && <tr><td className="text-muted">Intrinsic value, all my warrants</td><td className="mono text-right">{fmtUsd(math!.intrinsic * position.totalWarrants * rate, 2)}</td></tr>}
              <tr><td className="text-muted">{WARRANT_TERMS.symbol} quote{m.snapshot.warrant ? ` — provider symbol "${m.snapshot.warrant.symbol}"${m.snapshot.warrantSymbolIsGuess ? " (a guessed spelling: verify it is the warrant)" : " (configured)"}${m.snapshot.warrant.asOf ? `, as of ${fmtBrisbane(m.snapshot.warrant.asOf)}` : ""}` : ""}</td><td className="mono text-right">{wq == null ? <span className="text-amber">WARRANT QUOTE NOT AVAILABLE</span> : fmtUsd(wq)}</td></tr>
              {math!.timeValue != null && <tr><td className="text-muted">Time value = warrant price − intrinsic</td><td className="mono text-right">{fmtUsd(math!.timeValue)}</td></tr>}
            </tbody></table>
          )}
          {m.snapshot && [m.snapshot.gme, m.snapshot.warrant].some((q) => q?.asOf && Date.parse(feed.generatedAt) - Date.parse(q.asOf) > QUOTE_STALE_MS) && <p className="mono mt-2 text-[11px] text-amber">STALE QUOTE — the provider&apos;s timestamp is more than 24h old (market closed or provider lagging).</p>}
          <p className="mono mt-2 text-[11px] text-muted">Quotes come from a third-party provider and may be delayed; they are not a recommendation.</p>
        </div>
      </section>

      <section className="mt-6" aria-labelledby="rel">
        <h3 id="rel" className="panel-title mb-2">Related filings and releases</h3>
        <p className="mono mb-2 text-[11px] text-muted">A <span className="text-amber">TERMS?</span> flag means the filing&apos;s title/description mentions warrants together with an adjustment or exercise-price/rate wording — the full text is not scanned; open the filing.</p>
        <ul className="panel px-4">
          {related.length === 0 && <li className="py-6 text-center text-[12px] text-muted">No warrant-tagged filings or releases on the wire right now.</li>}
          {related.map((i) => <CompactItem key={i.id} item={i} note={ADJUST.test(`${i.title} ${i.summary ?? ""} ${i.tags.join(" ")}`) ? "TERMS?" : undefined} />)}
        </ul>
        <div className="mt-6 mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="panel-title">GameStop IR — warrant dividend page</h3>
          <a className="btn" href={WARRANT_TERMS.termsUrl} target="_blank" rel="noopener noreferrer">Open IR warrant page ↗</a>
        </div>
        <ul className="panel divide-y divide-white/[0.05]">
          {irPage.length === 0 && <li className="p-4 text-center text-[12px] text-muted">{irPageProblem(feed.irPages?.errors.warrants)}</li>}
          {irPage.map((e) => (
            <li key={e.url} className="p-3 text-[13px]"><a className="hover:text-blue" href={safeHref(e.url)} target="_blank" rel="noopener noreferrer">{e.title} ↗</a>{e.date && <span className="mono ml-2 text-[11px] text-muted">{fmtWhen({ publishedAt: e.date, dateOnly: e.dateOnly }, true)}</span>}<span className="tag ml-2">{e.kind}</span></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
