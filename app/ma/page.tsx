import { CompactItem, PageTitle } from "@/components/CompactItem";
import { buildFeed } from "@/lib/feed";
import { buildMa } from "@/lib/ma";
import { fmtWhen, irPageProblem } from "@/lib/format";
import { IR_PAGES } from "@/lib/config/watch";
import { safeHref } from "@/lib/url";
import type { WireItem } from "@/lib/types";

export const dynamic = "force-dynamic";

function Lane({ title, tone, blurb, items }: { title: string; tone: string; blurb: string; items: WireItem[] }) {
  return (
    <section className="panel flex min-w-0 flex-col" aria-label={title}>
      <header className="border-b border-line p-3.5">
        <h3 className="mono text-[12px] font-semibold tracking-[0.12em]" style={{ color: tone }}>{title} <span className="text-muted">· {items.length}</span></h3>
        <p className="mt-1 text-[12px] leading-snug text-muted">{blurb}</p>
      </header>
      <ul className="px-3.5">
        {items.length === 0 && <li className="py-8 text-center text-[12px] text-muted">Nothing in this lane right now.</li>}
        {items.slice(0, 40).map((i) => (
          <CompactItem key={i.id} item={i} note={i.officialStatement ? "OFFICIAL STATEMENT" : undefined} />
        ))}
      </ul>
      {items.some((i) => i.officialStatement) && <p className="mono border-t border-line p-3 text-[11px] text-amber">OFFICIAL STATEMENT confirms it was said, not that it will happen.</p>}
    </section>
  );
}

export default async function MaPage() {
  const feed = await buildFeed();
  const cps = feed.secBundle?.counterparties ?? [];
  const names = cps.flatMap((c) => [c.name, c.ticker]);
  const view = buildMa(feed.items, names, cps.map((c) => c.cik));
  const doc = feed.irPages?.ebay ?? [];
  const sec = feed.sources.find((s) => s.id === "sec");

  return (
    <div>
      <PageTitle title="M&A WATCH" sub={`Counterparties watched: ${cps.length ? cps.map((c) => `${c.name} (${c.ticker})`).join(", ") : "none resolved yet"} — set WATCH_COUNTERPARTY_TICKERS to add more. Items are placed in a column by their source type only; wording can never promote a rumour into a fact. The deal's status is reconstructed from sources below, not asserted here.`} />
      {sec && sec.status !== "live" && <p className="mono mb-3 rounded border border-line bg-panel px-3 py-2 text-[11.5px] text-amber" role="status">SEC {sec.status === "setup" ? "SETUP REQUIRED" : sec.status === "degraded" ? "serving stale data" : "unavailable"}{sec.lastError ? ` — ${sec.lastError}` : ""}</p>}

      <section className="mb-6" aria-labelledby="tl">
        <h3 id="tl" className="panel-title mb-2">Timeline of confirmed events (SEC filings and official GameStop releases, oldest first)</h3>
        <ol className="panel divide-y divide-white/[0.05]">
          {view.timeline.length === 0 && <li className="p-6 text-center text-[12px] text-muted">No confirmed M&A events on the wire. 8-K relevance cannot be judged from the filing list alone — use the IR eBay page list below.</li>}
          {view.timeline.map((i) => (
            <li key={i.id} className="grid grid-cols-[132px_minmax(0,1fr)] gap-3 p-3 max-sm:grid-cols-1">
              <time dateTime={i.publishedAt} className="mono text-[11.5px] text-muted">{fmtWhen(i, true)}</time>
              <div>
                <a className="text-[13.5px] font-medium hover:text-blue" href={safeHref(i.url)} target="_blank" rel="noopener noreferrer">{i.title} ↗</a>
                <div className="mono text-[10.5px] text-muted">{i.source} · {i.sourceType === "sec" ? "primary filing" : "official release"}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Lane title="CONFIRMED FACT" tone="var(--color-green)" blurb="SEC filings by/about GameStop and watched counterparties, official GameStop releases and documents, official @gamestop / @ryancohen posts." items={view.confirmed} />
        <Lane title="RELIABLE REPORTING" tone="var(--color-amber)" blurb="T1 / T2 news (Reuters, Bloomberg, WSJ, FT, AP, CNBC, Barron's …). Credible, not officially confirmed." items={view.reporting} />
        <Lane title="RUMOUR / SPECULATION" tone="var(--color-red)" blurb="T3, opinion and unknown sources, and non-official X accounts. Treat as unverified." items={view.rumour} />
      </div>

      <section className="mt-8" aria-labelledby="irdoc">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 id="irdoc" className="panel-title">GameStop IR — eBay page (news, documents, SEC filings as listed by the company)</h3>
          <a className="btn" href={IR_PAGES.ebay} target="_blank" rel="noopener noreferrer">Open IR eBay page ↗</a>
        </div>
        <ul className="panel divide-y divide-white/[0.05]">
          {doc.length === 0 && <li className="p-5 text-center text-[12px] text-muted">{irPageProblem(feed.irPages?.errors.ebay)}</li>}
          {doc.map((e) => (
            <li key={e.url} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3 text-[13px]">
              <span className="tag">{e.kind}</span>
              <a className="min-w-0 flex-1 hover:text-blue" href={safeHref(e.url)} target="_blank" rel="noopener noreferrer">{e.title} ↗</a>
              {e.date && <time dateTime={e.date} className="mono text-[11px] text-muted">{fmtWhen({ publishedAt: e.date, dateOnly: e.dateOnly }, true)}</time>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
