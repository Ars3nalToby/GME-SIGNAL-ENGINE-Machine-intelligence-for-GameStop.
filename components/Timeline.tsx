"use client";
import type { WireItem } from "@/lib/types";
import { dayBucket, fmtHm, fmtNY } from "@/lib/time";
import { BRISBANE_ZONE } from "@/lib/config/watch";
import { kindLabel, sourceColor, sourceShort } from "@/lib/format";
import { safeHref } from "@/lib/url";
import { useNow } from "@/lib/client/useNow";

export default function Timeline({ items }: { items: WireItem[] }) {
  const now = useNow();
  const groups: { label: string; rows: WireItem[] }[] = [];
  for (const it of items) {
    const label = now ? dayBucket(it.publishedAt, now) : it.publishedAt.slice(0, 10);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.rows.push(it);
    else groups.push({ label, rows: [it] });
  }
  return (
    <div className="panel overflow-hidden">
      {groups.map((g) => (
        <section key={g.label}>
          <h3 className="mono sticky top-0 z-[1] flex items-center gap-3 border-b border-line bg-[#0d1118]/95 px-4 py-2 text-[10.5px] tracking-[0.18em] text-ink2 uppercase backdrop-blur">
            {g.label} <span className="tracking-normal text-muted normal-case">· Brisbane time (hover for New York)</span>
          </h3>
          <ul>
            {g.rows.map((i) => (
              <li key={i.id} className="mono grid grid-cols-[46px_88px_86px_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-white/[0.04] px-4 py-2.5 text-[12px] transition-colors last:border-0 hover:bg-white/[0.03] max-md:grid-cols-[46px_minmax(0,1fr)_auto]">
                <time dateTime={i.publishedAt} title={fmtNY(i.publishedAt)} className="text-muted">{i.dateOnly ? "date" : fmtHm(i.publishedAt, BRISBANE_ZONE)}</time>
                <span className="inline-flex items-center gap-2 truncate text-ink2 max-md:hidden"><span className="dot !h-1.5 !w-1.5" style={{ background: sourceColor(i) }} aria-hidden />{sourceShort(i)}</span>
                <span className="truncate text-muted max-md:hidden">{kindLabel(i)}</span>
                <a href={safeHref(i.url)} target="_blank" rel="noopener noreferrer" className="truncate font-sans text-[13.5px] text-ink transition-colors hover:text-blue" title={i.title}>{i.title}</a>
                <span className={`score score-${i.signal} !cursor-default !px-2 !py-0.5`} title={i.scoreReasons.join(" · ")}>{i.score}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
