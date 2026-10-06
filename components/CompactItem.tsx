import type { WireItem } from "@/lib/types";
import { fmtBrisbane } from "@/lib/time";
import { kindLabel } from "@/lib/format";
import { safeHref } from "@/lib/url";

/** Server-rendered, text-only row. Deterministic (absolute Brisbane time) so there is nothing to hydrate. */
export function CompactItem({ item, note }: { item: WireItem; note?: string }) {
  const href = safeHref(item.url);
  return (
    <li className="border-b border-[#1a2030] py-2.5 last:border-0">
      <div className="mono flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] tracking-[0.04em] text-muted">
        <span className="text-ink">{item.source}</span>
        <time dateTime={item.publishedAt}>{fmtBrisbane(item.publishedAt)}</time>
        <span>{kindLabel(item)}</span>
        {note && <span className="rounded border border-amber px-1.5 text-amber">{note}</span>}
        <span className={`score score-${item.signal} !cursor-default !px-1.5 !py-0 ml-auto`} title={item.scoreReasons.join(" · ")}>{item.signal.toUpperCase()} {item.score}</span>
      </div>
      <div className="mt-1 text-[13.5px] leading-snug font-medium">
        {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-blue">{item.title} <span className="text-muted">↗</span></a> : item.title}
      </div>
      {item.summary && <p className="mt-0.5 text-[12px] leading-snug text-muted">{item.summary}</p>}
      {item.alsoReportedBy && item.alsoReportedBy.length > 0 && (
        <p className="mono mt-0.5 text-[10.5px] text-muted">Also reported by {item.alsoReportedBy.map((o) => o.outlet).join(", ")}</p>
      )}
    </li>
  );
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-5">
      <h2 className="mono text-[22px] font-semibold tracking-[0.06em]">{title}</h2>
      {sub && <p className="mt-1 max-w-3xl text-[13px] leading-snug text-muted">{sub}</p>}
    </div>
  );
}

export function SourceNote({ status, note }: { status?: string; note?: string }) {
  if (!status || status === "live") return note ? <p className="mono mb-3 text-[11px] text-muted">{note}</p> : null;
  return <p className="mono mb-3 rounded border border-line bg-panel px-3 py-2 text-[11.5px] text-amber" role="status">{note}</p>;
}
