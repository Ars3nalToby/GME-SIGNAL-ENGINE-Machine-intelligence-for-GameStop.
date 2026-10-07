"use client";
import { useEffect, useRef } from "react";
import type { WireItem } from "@/lib/types";
import { fmtBrisbane, fmtDateOnly, fmtNY, relAge } from "@/lib/time";
import { fmtInt, fmtPrice, fmtUsd, kindLabel, sourceColor } from "@/lib/format";
import { safeHref } from "@/lib/url";
import { useNow } from "@/lib/client/useNow";
import { ScoreBadge } from "./ItemCard";

/**
 * In-page reader. It shows what the wire actually holds about an item (title, summary, parsed filing values,
 * scoring reasons, sources) — never scraped or re-hosted article text — and always links the original.
 */
export default function Reader({ list, index, saved, onToggleSave, onNavigate, onClose }: {
  list: WireItem[]; index: number; saved: boolean; onToggleSave: () => void; onNavigate: (i: number) => void; onClose: () => void;
}) {
  const item = list[index];
  const now = useNow();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevOverflow;
      returnTo?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "j") onNavigate(Math.min(list.length - 1, index + 1));
      else if (e.key === "ArrowLeft" || e.key === "k") onNavigate(Math.max(0, index - 1));
      else if (e.key === "Tab" && ref.current) {
        // keep focus inside the dialog
        const f = ref.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
        if (f.length === 0) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, list.length, onClose, onNavigate]);

  if (!item) return null;
  const open = safeHref(item.url);
  const txns = item.insiderTxns ?? [];

  return (
    <>
      <div className="reader-backdrop" onClick={onClose} aria-hidden />
      <div ref={ref} className="reader" role="dialog" aria-modal="true" aria-label={`Reader: ${item.title}`}>
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-[#0f1420]/95 px-5 py-3 backdrop-blur">
          <button className="btn !px-3" onClick={() => onNavigate(Math.max(0, index - 1))} disabled={index === 0} aria-label="Previous item">←</button>
          <button className="btn !px-3" onClick={() => onNavigate(Math.min(list.length - 1, index + 1))} disabled={index >= list.length - 1} aria-label="Next item">→</button>
          <span className="mono ml-1 text-[11px] text-muted">{index + 1} / {list.length}<span className="max-sm:hidden"> · ← → or j k</span></span>
          <button ref={closeRef} className="btn ml-auto" onClick={onClose} aria-label="Close reader">Close · Esc</button>
        </div>

        <div className="flex-1 px-5 pt-6 pb-8 md:px-7">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="mono inline-flex items-center gap-2 text-[11px] tracking-[0.06em] text-ink2">
              <span className="dot" style={{ background: sourceColor(item), boxShadow: `0 0 8px ${sourceColor(item)}` }} aria-hidden />{item.source}
            </span>
            <span className="mono rounded-md border border-line px-2 py-0.5 text-[10.5px] tracking-[0.12em] text-muted">{kindLabel(item)}</span>
            <span className="ml-auto"><ScoreBadge item={item} open onToggle={() => undefined} /></span>
          </div>

          <h2 className="display mt-5 text-[26px] leading-[1.12] md:text-[31px]">{item.title}</h2>
          <p className="mono mt-3 text-[11px] leading-relaxed text-muted" suppressHydrationWarning>
            {item.dateOnly ? fmtDateOnly(item.publishedAt) : <>{fmtBrisbane(item.publishedAt, true)} · {fmtNY(item.publishedAt)}{now ? ` · ${relAge(item.publishedAt, now)}` : ""}</>}
          </p>

          {item.summary && <p className="mt-5 text-[15.5px] leading-relaxed text-ink2">{item.summary}</p>}
          {(item.parseNote === "unparsed" || item.parseNote === "pending") && <p className="mono mt-3 text-[12px] text-amber">{item.parseNote === "unparsed" ? "UNPARSED — open the filing for the facts." : "DETAILS LOADING — open the filing for the facts."}</p>}

          {txns.length > 0 && (
            <div className="mt-6">
              <h3 className="eyebrow mb-2">Parsed transactions (from the filing XML)</h3>
              <div className="scroll-x rounded-xl border border-line">
                <table className="dt min-w-[480px]">
                  <thead><tr><th>Transaction</th><th className="text-right">Shares</th><th className="text-right">Price</th><th className="text-right">Value</th><th className="text-right">After</th></tr></thead>
                  <tbody>
                    {txns.map((t, i) => (
                      <tr key={i}>
                        <td>{t.isWarrant && (t.code === "X" || t.code === "M") ? "Warrant exercise" : t.codeLabel}<div className="mono text-[10.5px] text-muted">{t.date} · code {t.code} · {t.securityTitle}{t.isDerivative ? " (derivative)" : ""}</div></td>
                        <td className="mono text-right">{fmtInt(t.shares)}</td>
                        <td className="mono text-right">{fmtPrice(t.pricePerShare)}{t.priceIsAverage ? " avg" : ""}</td>
                        <td className="mono text-right">{t.value === null ? "—" : fmtUsd(t.value, 0)}</td>
                        <td className="mono text-right">{fmtInt(t.sharesOwnedAfter)} ({t.directIndirect})</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {txns.some((t) => t.priceNote) && <p className="mono mt-2 text-[11px] text-amber">avg — see footnote: {txns.find((t) => t.priceNote)?.priceNote}</p>}
            </div>
          )}

          <div className="mt-6">
            <h3 className="eyebrow mb-2">Why this score — relevance, not price direction</h3>
            <ul className="mono list-disc space-y-1 pl-4 text-[11.5px] leading-relaxed text-muted">{item.scoreReasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>

          {item.alsoReportedBy && item.alsoReportedBy.length > 0 && (
            <div className="mt-6">
              <h3 className="eyebrow mb-2">Also reported by</h3>
              <ul className="space-y-1 text-[13px]">{item.alsoReportedBy.map((o) => <li key={o.url}><a className="link" href={safeHref(o.url)} target="_blank" rel="noopener noreferrer">{o.outlet} ↗</a></li>)}</ul>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-1.5">{item.tags.map((t) => <span key={t} className="tag">{t}</span>)}{item.via && <span className="tag">{item.via}</span>}</div>

          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            {open && <a href={open} target="_blank" rel="noopener noreferrer" className="btn !bg-ink !text-bg !border-ink font-semibold">Open original source ↗</a>}
            {(item.altLinks ?? []).map((l) => <a key={l.url} href={safeHref(l.url)} target="_blank" rel="noopener noreferrer" className="btn">{l.label} ↗</a>)}
            <button className="btn" onClick={onToggleSave} aria-pressed={saved}>{saved ? "★ Saved" : "☆ Save"}</button>
          </div>
          <p className="mono mt-6 text-[10.5px] leading-relaxed text-muted">The reader shows what the wire holds about this item. The full article or filing lives at the original source — always open it before acting on anything.</p>
        </div>
      </div>
    </>
  );
}
