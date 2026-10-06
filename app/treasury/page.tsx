import { CompactItem, PageTitle } from "@/components/CompactItem";
import { buildFeed } from "@/lib/feed";
import { loadFundamentals, type ConceptSeries } from "@/lib/sources/xbrl";
import { fmtInt, fmtUsd } from "@/lib/format";
import { safeHref } from "@/lib/url";

export const dynamic = "force-dynamic";

const TREASURY_RE = /\b(bitcoin|btc|crypto\w*|treasury|investment polic\w*|digital assets?)\b/i;

function Concept({ c }: { c: ConceptSeries }) {
  const ends = [...new Set(c.series.map((p) => p.end))].sort().reverse().slice(0, 6);
  const tags = [...new Set(c.series.map((p) => `${p.taxonomy}:${p.tag}`))];
  return (
    <section className="panel mb-4" aria-label={c.label}>
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line p-3.5">
        <h3 className="text-[14px] font-semibold">{c.label}</h3>
        <span className="mono text-[10.5px] text-muted">tags found: {c.tagsFound.length ? c.tagsFound.join(", ") : "none"}</span>
      </header>
      {c.status === "not_tagged" ? (
        <p className="mono p-4 text-[12px] text-amber">not tagged in XBRL — see filing</p>
      ) : (
        <div className="scroll-x">
          <table className="dt min-w-[640px]">
            <thead><tr><th>Tag</th>{ends.map((e) => <th key={e} className="text-right">{e}</th>)}</tr></thead>
            <tbody>
              {tags.map((t) => (
                <tr key={t}>
                  <td className="mono text-[11.5px]">{t}</td>
                  {ends.map((e) => {
                    const p = c.series.find((x) => `${x.taxonomy}:${x.tag}` === t && x.end === e);
                    return (
                      <td key={e} className="mono text-right">
                        {p ? (
                          <a className="link" href={safeHref(p.url)} target="_blank" rel="noopener noreferrer" title={`${p.taxonomy}:${p.tag} · period end ${p.end} · ${p.form} filed ${p.filed} · accession ${p.accn}`}>
                            {p.unit === "USD" ? fmtUsd(p.val, 0) : `${fmtInt(p.val)} ${p.unit}`}
                            <div className="text-[10px] text-muted">{p.form} · filed {p.filed}</div>
                          </a>
                        ) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function TreasuryPage() {
  const feed = await buildFeed();
  let f;
  let err: string | undefined;
  try {
    f = (await loadFundamentals()).value;
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }
  const items = feed.items.filter((i) => (i.sourceType === "sec" || i.sourceType === "ir") && TREASURY_RE.test(`${i.title} ${i.summary ?? ""} ${i.tags.join(" ")}`));

  return (
    <div>
      <PageTitle title="TREASURY WATCH" sub="Balance-sheet items from SEC XBRL (10-Q / 10-K period-end values). Each number carries its tag, period, form and filing date and links to the filing. Tags are discovered from GameStop's own data, never assumed." />
      {err && <p className="mono mb-3 rounded border border-line bg-panel px-3 py-2 text-[11.5px] text-amber" role="status">XBRL unavailable — {err}</p>}
      {f?.concepts.map((c) => <Concept key={c.id} c={c} />)}
      {f && <p className="mono mb-6 text-[11px] text-muted">{f.entityName ?? "GameStop"} · XBRL companyfacts fetched {f.fetchedAt.slice(0, 19)}Z · refreshed every 6h</p>}

      <section aria-labelledby="tf">
        <h3 id="tf" className="panel-title mb-2">Bitcoin / treasury / investment-policy items — SEC and GameStop IR only</h3>
        <ul className="panel px-4">
          {items.length === 0 && <li className="py-6 text-center text-[12px] text-muted">No matching SEC or IR items on the wire right now. (Titles and descriptions only; filing text is not scanned.)</li>}
          {items.map((i) => <CompactItem key={i.id} item={i} />)}
        </ul>
      </section>
    </div>
  );
}
