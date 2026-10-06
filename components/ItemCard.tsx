"use client";
import { useState } from "react";
import type { WireItem } from "@/lib/types";
import { PERSON_BADGE } from "@/lib/people";
import { isPeopleItem } from "@/lib/filters";
import { kindLabel } from "@/lib/format";
import { safeHref } from "@/lib/url";
import { Age } from "./Time";

const X_BADGE: Record<string, string> = { ryancohen: "RC", larryvc: "LC", gamestop: "GS" };

export function ScoreBadge({ item, open, onToggle }: { item: WireItem; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`score score-${item.signal}`} onClick={onToggle} aria-expanded={open} aria-label={`Signal ${item.signal}, score ${item.score}. Show reasons`} title="Why this score?">
      {item.signal.toUpperCase()} {item.score}
    </button>
  );
}

export function Reasons({ item }: { item: WireItem }) {
  return (
    <div className="mono mt-2 rounded border border-line bg-bg/60 p-2 text-[11px] leading-relaxed text-muted" role="note">
      <div className="mb-1 tracking-[0.1em] uppercase">Score reasons — relevance, not price direction</div>
      <ul className="list-disc pl-4">{item.scoreReasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
    </div>
  );
}

const Ext = ({ href, children, strong }: { href?: string; children: React.ReactNode; strong?: boolean }) => {
  const h = safeHref(href);
  if (!h) return null;
  return (
    <a href={h} target="_blank" rel="noopener noreferrer" className={`mono inline-flex min-h-[32px] items-center text-[11px] tracking-[0.08em] uppercase ${strong ? "text-ink hover:text-blue" : "text-muted hover:text-ink"}`}>
      {children}
    </a>
  );
};

export default function ItemCard({ item, saved, onToggleSave, isNew }: { item: WireItem; saved: boolean; onToggleSave: () => void; isNew?: boolean }) {
  const [reasons, setReasons] = useState(false);
  const [outlets, setOutlets] = useState(false);
  const person = isPeopleItem(item) ? item.people[0] : undefined;
  const rule = person === "ryan_cohen" ? "border-l-red" : person === "larry_cheng" ? "border-l-amber" : "border-l-transparent";
  const badge = person ? PERSON_BADGE[person] : item.sourceType === "x" ? X_BADGE[item.handle ?? ""] : undefined;
  const filingIndex = item.sourceType === "sec" ? item.altLinks?.[0] : undefined;
  const others = (item.altLinks ?? []).filter((l) => l !== filingIndex);
  const unparsed = item.parseNote === "unparsed";
  const pending = item.parseNote === "pending";

  return (
    <article className={`panel border-l-[3px] ${rule} p-3.5`} aria-label={item.title}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="mono text-[11px] tracking-[0.04em] text-muted">
          <span className="text-ink">{item.source}</span> · <Age iso={item.publishedAt} />
        </span>
        {isNew && <span className="mono rounded bg-red px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.1em]">NEW</span>}
        <span className="mono ml-auto text-[11px] font-medium tracking-[0.1em] text-muted">{kindLabel(item)}</span>
        {badge && <span className={`mono rounded px-1.5 py-0.5 text-[10px] font-semibold ${person === "larry_cheng" ? "bg-amber text-bg" : person === "ryan_cohen" ? "bg-red text-white" : "border border-line text-muted"}`} title={person ? "Tracked insider" : "Account"}>{badge}</span>}
        <ScoreBadge item={item} open={reasons} onToggle={() => setReasons((v) => !v)} />
      </div>

      <h3 className="mt-2 text-[15px] leading-snug font-semibold">
        {safeHref(item.url) ? (
          <a href={safeHref(item.url)} target="_blank" rel="noopener noreferrer" className="hover:text-blue">{item.title}</a>
        ) : item.title}
      </h3>
      {item.summary && <p className="mt-1 text-[13px] leading-snug text-muted">{item.summary}</p>}
      {item.insiderTxns && item.insiderTxns.some((t) => t.priceNote) && (
        <p className="mono mt-1 text-[11px] text-amber">avg — see footnote: {item.insiderTxns.find((t) => t.priceNote)?.priceNote}</p>
      )}
      {(unparsed || pending) && <p className="mono mt-1 text-[11px] text-amber">{unparsed ? "UNPARSED — open filing" : "DETAILS LOADING — open filing"}</p>}
      {reasons && <Reasons item={item} />}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {item.tags.slice(0, 7).map((t) => <span key={t} className="tag">{t}</span>)}
        {item.via && <span className="tag">{item.via}</span>}
        {item.cluster && item.cluster.count > 0 && (
          <button type="button" className="tag text-blue" onClick={() => setOutlets((v) => !v)} aria-expanded={outlets}>+{item.cluster.count} outlet{item.cluster.count > 1 ? "s" : ""}</button>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-x-4">
          <button type="button" onClick={onToggleSave} aria-pressed={saved} className="mono min-h-[32px] text-[11px] tracking-[0.08em] uppercase text-muted hover:text-ink">
            {saved ? "★ SAVED" : "☆ SAVE"}
          </button>
          <Ext href={filingIndex?.url}>{filingIndex?.label.toUpperCase() ?? ""}</Ext>
          {others.map((l) => <Ext key={l.url} href={l.url}>{l.label}</Ext>)}
          <Ext href={item.url} strong>OPEN ↗</Ext>
        </span>
      </div>
      {outlets && item.alsoReportedBy && item.alsoReportedBy.length > 0 && (
        <ul className="mono mt-2 space-y-1 border-t border-line pt-2 text-[11px]">
          {item.alsoReportedBy.map((o) => (
            <li key={o.url}>Also reported by <a className="link" href={safeHref(o.url)} target="_blank" rel="noopener noreferrer">{o.outlet}</a></li>
          ))}
        </ul>
      )}
    </article>
  );
}
