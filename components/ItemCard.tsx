"use client";
import { useState } from "react";
import type { WireItem } from "@/lib/types";
import { PERSON_BADGE } from "@/lib/people";
import { isPeopleItem } from "@/lib/filters";
import { kindLabel, sourceColor } from "@/lib/format";
import { safeHref } from "@/lib/url";
import { Stamp } from "./Time";

const X_BADGE: Record<string, string> = { ryancohen: "RC", larryvc: "LC", gamestop: "GS" };

export function ScoreBadge({ item, open, onToggle }: { item: WireItem; open: boolean; onToggle: () => void }) {
  const lit = Math.max(1, Math.ceil(item.score / 20));
  return (
    <button type="button" className={`score score-${item.signal}`} onClick={onToggle} aria-expanded={open} aria-label={`Signal ${item.signal}, score ${item.score}. Show reasons`} title="Why this score?">
      <span className="meter" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => <i key={i} className={i < lit ? "on" : ""} style={{ height: 4 + i * 1.75 }} />)}
      </span>
      {item.signal.toUpperCase()} {item.score}
    </button>
  );
}

export function Reasons({ item }: { item: WireItem }) {
  return (
    <div className="mono mt-3 rounded-xl border border-line bg-black/30 p-3 text-[11px] leading-relaxed text-muted" role="note">
      <div className="mb-1.5 tracking-[0.14em] text-ink2 uppercase">Score reasons — relevance, not price direction</div>
      <ul className="list-disc space-y-0.5 pl-4">{item.scoreReasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
    </div>
  );
}

const Ext = ({ href, children, strong }: { href?: string; children: React.ReactNode; strong?: boolean }) => {
  const h = safeHref(href);
  if (!h) return null;
  return (
    <a href={h} target="_blank" rel="noopener noreferrer" className={`mono inline-flex min-h-[32px] items-center rounded-full px-3 text-[11px] tracking-[0.1em] uppercase transition-colors ${strong ? "bg-white/[0.07] text-ink hover:bg-white/[0.14]" : "text-muted hover:text-ink"}`}>
      {children}
    </a>
  );
};

export default function ItemCard({ item, saved, onToggleSave, isNew }: { item: WireItem; saved: boolean; onToggleSave: () => void; isNew?: boolean }) {
  const [reasons, setReasons] = useState(false);
  const [outlets, setOutlets] = useState(false);
  const person = isPeopleItem(item) ? item.people[0] : undefined;
  const rule = person === "ryan_cohen" ? "card-rc" : person === "larry_cheng" ? "card-lc" : "";
  const badge = person ? PERSON_BADGE[person] : item.sourceType === "x" ? X_BADGE[item.handle ?? ""] : undefined;
  const filingIndex = item.sourceType === "sec" ? item.altLinks?.[0] : undefined;
  const others = (item.altLinks ?? []).filter((l) => l !== filingIndex);
  const unparsed = item.parseNote === "unparsed";
  const pending = item.parseNote === "pending";

  return (
    <article className={`card ${item.signal === "high" ? "card-high" : ""} ${rule}`} aria-label={item.title}>
      <div className="card-grid">
        <Stamp iso={item.publishedAt} dateOnly={item.dateOnly} />

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span className="mono inline-flex items-center gap-2 text-[11px] tracking-[0.06em] text-ink2">
              <span className="dot" style={{ background: sourceColor(item), boxShadow: `0 0 8px ${sourceColor(item)}` }} aria-hidden />
              {item.source}
            </span>
            <span className="mono rounded-md border border-line px-2 py-0.5 text-[10.5px] font-medium tracking-[0.12em] text-muted">{kindLabel(item)}</span>
            {badge && (
              <span className={`mono rounded-md px-1.5 py-0.5 text-[10px] font-bold ${person === "larry_cheng" ? "bg-amber text-bg" : person === "ryan_cohen" ? "bg-red text-white" : "border border-line text-muted"}`} title={person ? "Tracked insider" : "Account"}>
                {badge}
              </span>
            )}
            {isNew && <span className="mono rounded-md bg-red px-1.5 py-0.5 text-[10px] font-bold tracking-[0.1em]">NEW</span>}
            <span className="ml-auto"><ScoreBadge item={item} open={reasons} onToggle={() => setReasons((v) => !v)} /></span>
          </div>

          <h3 className="mt-2.5 text-[17px] leading-[1.32] font-semibold tracking-[-0.012em] md:text-[18.5px]">
            {safeHref(item.url) ? <a href={safeHref(item.url)} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-blue">{item.title}</a> : item.title}
          </h3>
          {item.summary && <p className="mt-1.5 max-w-[78ch] text-[14px] leading-relaxed text-muted">{item.summary}</p>}
          {item.insiderTxns && item.insiderTxns.some((t) => t.priceNote) && (
            <p className="mono mt-1.5 text-[11px] text-amber">avg — see footnote: {item.insiderTxns.find((t) => t.priceNote)?.priceNote}</p>
          )}
          {(unparsed || pending) && <p className="mono mt-1.5 text-[11px] text-amber">{unparsed ? "UNPARSED — open filing" : "DETAILS LOADING — open filing"}</p>}
          {reasons && <Reasons item={item} />}

          <div className="mt-3.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            {item.tags.slice(0, 6).map((t) => <span key={t} className="tag">{t}</span>)}
            {item.via && <span className="tag">{item.via}</span>}
            {item.cluster && item.cluster.count > 0 && (
              <button type="button" className="tag !border-blue/40 !text-blue" onClick={() => setOutlets((v) => !v)} aria-expanded={outlets}>+{item.cluster.count} outlet{item.cluster.count > 1 ? "s" : ""}</button>
            )}
            <span className="ml-auto flex flex-wrap items-center">
              <button type="button" onClick={onToggleSave} aria-pressed={saved} className={`mono min-h-[32px] rounded-full px-3 text-[11px] tracking-[0.1em] uppercase transition-colors ${saved ? "text-amber" : "text-muted hover:text-ink"}`}>
                {saved ? "★ SAVED" : "☆ SAVE"}
              </button>
              <Ext href={filingIndex?.url}>{filingIndex?.label.toUpperCase() ?? ""}</Ext>
              {others.map((l) => <Ext key={l.url} href={l.url}>{l.label}</Ext>)}
              <Ext href={item.url} strong>OPEN ↗</Ext>
            </span>
          </div>
          {outlets && item.alsoReportedBy && item.alsoReportedBy.length > 0 && (
            <ul className="mono mt-3 space-y-1 border-t border-line pt-2.5 text-[11px] text-muted">
              {item.alsoReportedBy.map((o) => (
                <li key={o.url}>Also reported by <a className="link" href={safeHref(o.url)} target="_blank" rel="noopener noreferrer">{o.outlet}</a></li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </article>
  );
}
