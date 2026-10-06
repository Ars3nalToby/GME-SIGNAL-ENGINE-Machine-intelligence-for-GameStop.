"use client";
import type { WireItem } from "@/lib/types";
import { dayBucket, fmtHm, fmtNY } from "@/lib/time";
import { BRISBANE_ZONE } from "@/lib/config/watch";
import { kindLabel, sourceShort } from "@/lib/format";
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
          <h3 className="panel-title sticky top-0 border-b border-line bg-panel2 px-3 py-1.5">{g.label} <span className="normal-case tracking-normal">· Brisbane time (hover for New York)</span></h3>
          <ul>
            {g.rows.map((i) => (
              <li key={i.id} className="mono grid grid-cols-[44px_72px_78px_minmax(0,1fr)_auto] items-baseline gap-x-2 border-b border-[#1a2030] px-3 py-1.5 text-[12px] hover:bg-white/[0.02] max-md:grid-cols-[44px_minmax(0,1fr)_auto]">
                <time dateTime={i.publishedAt} title={fmtNY(i.publishedAt)} className="text-muted">{fmtHm(i.publishedAt, BRISBANE_ZONE)}</time>
                <span className="truncate text-muted max-md:hidden">{sourceShort(i)}</span>
                <span className="truncate text-muted max-md:hidden">{kindLabel(i)}</span>
                <a href={safeHref(i.url)} target="_blank" rel="noopener noreferrer" className="truncate font-sans text-[13px] text-ink hover:text-blue" title={i.title}>{i.title}</a>
                <span className={`score score-${i.signal} !cursor-default !px-1.5 !py-0`} title={i.scoreReasons.join(" · ")}>{i.score}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
