"use client";
import { useState } from "react";
import type { SourceHealth } from "@/lib/types";
import type { Position } from "@/lib/config/position";
import { WARRANT_TERMS } from "@/lib/config/watch";
import { staleLabel } from "@/lib/health-view";
import { fmtBrisbane, parseDeadline, relAge } from "@/lib/time";
import { fmtInt, fmtUsd } from "@/lib/format";
import { safeHref } from "@/lib/url";
import { useNow } from "@/lib/client/useNow";
import type { WireItem } from "@/lib/types";
import type { XWatchEntry } from "@/lib/sources/x";
import WarrantCountdown from "./WarrantCountdown";

export type MarketView = { status: "connected" | "setup" | "error"; provider?: string; gme?: { price: number; asOf: string | null } | null; warrant?: { price: number; asOf: string | null } | null; note?: string };

const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="panel p-5">
    <h2 className="panel-title mb-4">{title}</h2>
    {children}
  </section>
);

function statusView(h: SourceHealth, now: number) {
  if (h.status === "live") return { c: "var(--color-green)", t: "LIVE" };
  if (h.status === "degraded") return { c: "var(--color-amber)", t: now ? staleLabel(h, now) : "STALE" };
  if (h.status === "setup") return { c: "var(--color-amber)", t: h.id === "x" ? "X API NOT CONNECTED" : h.id === "market" ? "MARKET DATA NOT CONNECTED" : "SETUP REQUIRED" };
  return { c: "var(--color-red)", t: "ERROR" };
}

export function SourceHealthPanel({ sources, failed, error }: { sources: SourceHealth[]; failed: boolean; error?: string }) {
  const now = useNow();
  return (
    <Panel title="Source health">
      {failed && <p className="mono mb-2 text-[11px] text-red">/api/feed unavailable{error ? ` — ${error}` : ""}</p>}
      {sources.length === 0 && !failed && <p className="mono text-[11px] text-muted">Waiting for first poll…</p>}
      <ul className="-mx-2 space-y-0.5">
        {sources.map((s) => {
          const v = statusView(s, now);
          return (
            <li key={s.id} className="rounded-xl px-2 py-2.5 text-[12.5px] transition-colors hover:bg-white/[0.03]">
              <div className="flex items-center gap-2.5">
                <span className="dot" style={{ background: v.c, boxShadow: `0 0 9px ${v.c}` }} aria-hidden />
                <span className="font-medium">{s.label}</span>
                <span className="mono ml-auto rounded-full border px-2 py-0.5 text-[9.5px] tracking-[0.08em]" style={{ color: v.c, borderColor: `color-mix(in srgb, ${v.c} 35%, transparent)`, background: `color-mix(in srgb, ${v.c} 8%, transparent)` }}>{v.t}</span>
              </div>
              <div className="mono mt-1 pl-[18px] text-[10.5px] leading-relaxed text-muted">
                {s.status !== "setup" && <span>{s.itemCount} items{s.latencyMs != null ? ` · ${s.latencyMs}ms` : ""}{s.lastSuccessAt && now ? ` · ok ${relAge(s.lastSuccessAt, now)}` : ""}</span>}
                {s.lastError && <div className="text-amber break-words">{s.lastError}</div>}
                {s.note && s.note !== s.lastError && <div className="break-words">{s.note}</div>}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export function PositionPanel({ position, market }: { position: Position; market: MarketView }) {
  const now = useNow();
  const price = WARRANT_TERMS.exercisePriceUsd;
  return (
    <Panel title="My position · warrant clock">
      <WarrantCountdown />
      <div className="mt-4 border-t border-line pt-4">
        {position.status === "invalid" && <p className="mono text-[11px] text-red">{position.error}. See README → My Position.</p>}
        {position.status === "hidden" && <p className="mono text-[11px] text-amber">Position hidden: this site has no password, so personal holdings are not shown. See README → My Position.</p>}
        {position.status === "empty" && <p className="mono text-[11px] text-muted">No position configured on the server (never committed) — see README → My Position.</p>}
        {position.status === "set" && (
          <table className="dt mono" aria-label="Holdings by venue">
            <thead><tr><th>Venue</th><th className="text-right">Shares</th><th className="text-right">Warrants</th></tr></thead>
            <tbody>
              {position.venues.map((v) => (
                <tr key={v}><td>{v}</td><td className="text-right">{fmtInt(position.shares[v] ?? 0)}</td><td className="text-right">{fmtInt(position.warrants[v] ?? 0)}</td></tr>
              ))}
              <tr className="font-semibold"><td>TOTAL</td><td className="text-right">{fmtInt(position.totalShares)}</td><td className="text-right">{fmtInt(position.totalWarrants)}</td></tr>
            </tbody>
          </table>
        )}
        {position.status === "set" && position.totalWarrants > 0 && (
          <p className="mono mt-2 text-[11px] leading-relaxed text-muted">
            Exercise cash if all warrants exercised: <b className="text-ink">{fmtUsd(position.totalWarrants * price, 0)}</b> ({fmtInt(position.totalWarrants)} × {fmtUsd(price)}) for <b className="text-ink">{fmtInt(position.totalWarrants * WARRANT_TERMS.sharesPerWarrant)}</b> shares. Terms may be adjusted — <a className="link" href={WARRANT_TERMS.termsUrl} target="_blank" rel="noopener noreferrer">IR page</a>.
          </p>
        )}
        {position.status === "set" && position.totalWarrants > 0 && (
          <ul className="mono mt-2 space-y-1 text-[11px] text-muted">
            {position.venues.filter((v) => (position.warrants[v] ?? 0) > 0).map((v) => {
              const d = parseDeadline(position.warrantDeadlines[v]);
              return <li key={v}>{v}: {d ? <span>cut-off {fmtBrisbane(d.toUTC().toISO() ?? "", true)}{now && d.toMillis() < now ? " — PASSED" : ""}</span> : <span className="text-amber">CUT-OFF NOT SET — confirm with {v}</span>}</li>;
            })}
          </ul>
        )}
        <p className="mono mt-2 text-[11px] text-muted">
          {market.status === "connected" && market.gme ? (
            <>GME {fmtUsd(market.gme.price)} <span>({market.provider}{market.gme.asOf ? `, as of ${fmtBrisbane(market.gme.asOf)}` : ""})</span>{position.status === "set" && <> · shares value {fmtUsd(position.totalShares * market.gme.price, 0)}</>}</>
          ) : market.status === "connected" ? "GME quote unavailable from provider" : "MARKET DATA NOT CONNECTED"}
        </p>
      </div>
    </Panel>
  );
}

export function WatchWordsPanel({ words, setWords, onPick }: { words: string[]; setWords: (w: string[]) => void; onPick: (w: string) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <Panel title="Watch words">
      <div className="flex flex-wrap gap-1.5">
        {words.map((w) => (
          <span key={w} className="inline-flex items-center">
            <button type="button" className="chip rounded-r-none" onClick={() => onPick(w)} aria-label={`Search for ${w}`}>{w}</button>
            <button type="button" className="chip rounded-l-none border-l-0 px-2" aria-label={`Remove ${w}`} onClick={() => setWords(words.filter((x) => x !== w))}>×</button>
          </span>
        ))}
        {words.length === 0 && <span className="mono text-[11px] text-muted">No watch words.</span>}
      </div>
      <form className="mt-2.5 flex gap-2" onSubmit={(e) => { e.preventDefault(); const w = draft.trim(); if (w && !words.some((x) => x.toLowerCase() === w.toLowerCase())) setWords([...words, w]); setDraft(""); }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add word" aria-label="Add watch word" maxLength={40} className="mono min-h-[40px] w-full min-w-0 rounded-full border border-line bg-white/[0.03] px-4 text-[12px] placeholder:text-muted/60 focus:border-blue/60" />
        <button className="btn" type="submit">Add</button>
      </form>
    </Panel>
  );
}

export function XWatchPanel({ xWatch, connected, items, status }: { xWatch: XWatchEntry[]; connected: boolean; items: WireItem[]; status?: SourceHealth }) {
  const now = useNow();
  return (
    <Panel title="X watch">
      {!connected && <p className="mono mb-2 text-[11px] text-amber">X API NOT CONNECTED</p>}
      {connected && status && status.status !== "live" && <p className="mono mb-2 text-[11px] text-amber">{status.lastError ?? status.status}</p>}
      <ul className="space-y-2">
        {xWatch.map((w) => {
          const last = items.filter((i) => i.sourceType === "x" && i.handle === w.handle).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0];
          return (
            <li key={w.handle} className="flex items-center gap-2 text-[12px]">
              <span className="mono grid h-8 w-8 place-items-center rounded-full border border-line2 bg-white/[0.04] text-[10.5px] font-semibold" aria-hidden>{w.initials}</span>
              <span className="min-w-0 flex-1 truncate">{w.label} <span className="text-muted">@{w.handle}</span></span>
              <span className="mono text-[10.5px] text-muted">{connected ? (last ? (now ? relAge(last.publishedAt, now) : "—") : "no posts") : "—"}</span>
              <a className="link mono text-[10.5px]" href={safeHref(w.profileUrl)} target="_blank" rel="noopener noreferrer">PROFILE ↗</a>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export function SignalKey() {
  const row = (cls: string, label: string, text: string) => (
    <li className="flex items-center gap-3"><span className={`score ${cls} !cursor-default`}>{label}</span><span className="text-[12px] text-muted">{text}</span></li>
  );
  return (
    <Panel title="Signal key">
      <ul className="mono space-y-2.5">
        {row("score-high", "HIGH ≥ 85", "material primary-source event")}
        {row("score-medium", "MED 60–84", "relevant, worth a look")}
        {row("score-low", "LOW < 60", "context / noise")}
      </ul>
      <p className="mt-4 text-[12.5px] leading-relaxed text-muted">Score = how much this matters for understanding GameStop. <span className="text-ink2">Not a price prediction or trade signal.</span> Tap a score to see why.</p>
    </Panel>
  );
}
