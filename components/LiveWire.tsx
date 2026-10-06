"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { WireItem } from "@/lib/types";
import type { Position } from "@/lib/config/position";
import { applyFilters, FILTERS, type FilterId } from "@/lib/filters";
import { DEFAULT_WATCH_WORDS } from "@/lib/config/watch";
import { usePersisted, useBaseline, writeStore } from "@/lib/client/usePersisted";
import { useNow } from "@/lib/client/useNow";
import { relAge } from "@/lib/time";
import { useFeed } from "./FeedProvider";
import ItemCard from "./ItemCard";
import Timeline from "./Timeline";
import RcAlert, { rcAlertItems } from "./RcAlert";
import { PositionPanel, SignalKey, SourceHealthPanel, WatchWordsPanel, XWatchPanel, type MarketView } from "./Sidebar";

const PAGE = 60;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="panel px-3.5 py-3">
      <div className="panel-title">{label}</div>
      <div className="mono mt-1 text-[22px] leading-none font-semibold" suppressHydrationWarning>{value}</div>
      {sub && <div className="mono mt-1 text-[10.5px] text-muted">{sub}</div>}
    </div>
  );
}

export default function LiveWire({ position, market }: { position: Position; market: MarketView }) {
  const feed = useFeed();
  const now = useNow();
  const [filter, setFilter] = usePersisted<FilterId>("gmelw:filter", "all");
  const [view, setView] = usePersisted<"cards" | "timeline">("gmelw:view", "cards");
  const [highOnly, setHighOnly] = usePersisted<boolean>("gmelw:highOnly", false);
  const [words, setWords] = usePersisted<string[]>("gmelw:words", DEFAULT_WATCH_WORDS);
  const [savedMap, setSavedMap] = usePersisted<Record<string, WireItem>>("gmelw:saved", {});
  const [query, setQuery] = useState("");
  const [pageState, setPageState] = useState<{ key: string; n: number }>({ key: "", n: PAGE });
  const lastSeenAt = useBaseline("gmelw:lastSeenAt");
  const searchRef = useRef<HTMLInputElement>(null);

  // `lastSeenAt` = the previous visit's end; it is written when the tab is hidden/closed
  useEffect(() => {
    const save = () => writeStore("gmelw:lastSeenAt", Date.now());
    const onVis = () => document.visibilityState === "hidden" && save();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", save);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", save);
    };
  }, []);

  const savedIds = useMemo(() => new Set(Object.keys(savedMap)), [savedMap]);
  const saved = useMemo(() => Object.values(savedMap).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)), [savedMap]);
  const visible = useMemo(() => applyFilters(feed.items, { filter, highOnly, query, savedIds, saved }), [feed.items, filter, highOnly, query, savedIds, saved]);
  const pageKey = `${filter}|${highOnly}|${query}|${view}`;
  const shown = pageState.key === pageKey ? pageState.n : PAGE; // resets whenever filters change
  const setShown = (f: (n: number) => number) => setPageState({ key: pageKey, n: f(shown) });

  const toggleSave = (i: WireItem) =>
    setSavedMap((m) => {
      const n = { ...m };
      if (n[i.id]) delete n[i.id];
      else n[i.id] = i; // full snapshot: survives the item leaving the feed
      return n;
    });

  const high = feed.items.filter((i) => i.signal === "high").length;
  const latestSec = feed.items.find((i) => i.sourceType === "sec"); // feed is newest-first
  const core = feed.sources.filter((s) => s.id !== "market");
  const live = core.filter((s) => s.status === "live").length;
  const alerts = now ? rcAlertItems(feed.items, now) : [];
  const problems = core.filter((s) => s.status === "error" || s.status === "degraded");
  const counts = useMemo(() => ({ saved: saved.length }), [saved.length]);

  return (
    <div>
      <div className="mb-4">
        <h2 className="mono text-[26px] leading-tight font-semibold tracking-[0.04em] md:text-[34px]">EVERYTHING THAT CAN MOVE <span className="text-red">$GME</span></h2>
        <p className="mono mt-1 text-[11px] tracking-[0.12em] text-muted">LIVE WIRE · refreshes every 60s · SEC, GameStop IR, news{feed.xConnected ? ", X" : ""} — every item links to its original source</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Wire items" value={feed.loadedOnce ? String(feed.items.length) : "—"} />
        <Stat label="High signal" value={feed.loadedOnce ? String(high) : "—"} sub="score ≥ 85" />
        <Stat label="Latest SEC" value={latestSec ? `${latestSec.form ?? "—"} · ${now ? relAge(latestSec.publishedAt, now) : "…"}` : "—"} sub={latestSec ? latestSec.title.slice(0, 44) : undefined} />
        <Stat label="Sources live" value={core.length ? `${live}/${core.length}` : "—"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,73fr)_minmax(0,27fr)]">
        <div className="min-w-0">
          <RcAlert items={alerts} lastSeenAt={lastSeenAt} />

          <div className="sticky top-0 z-20 -mx-4 mb-3 border-b border-line bg-bg/95 px-4 py-2 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:py-0 md:backdrop-blur-none">
            <div className="flex items-center gap-2">
              <label htmlFor="q" className="sr-only">Search the wire</label>
              <input
                id="q" ref={searchRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search eBay, warrant, Form 4…" autoComplete="off"
                className="mono min-h-[44px] w-full min-w-0 rounded border border-line bg-panel px-3 text-[13px] placeholder:text-muted/60"
              />
              {query && <button className="btn min-h-[44px]" onClick={() => setQuery("")} aria-label="Clear search">Clear</button>}
            </div>
          </div>

          <div className="scroll-x mb-3 flex items-center gap-1.5 pb-1" role="toolbar" aria-label="Filters">
            {FILTERS.map((f) => (
              <button key={f.id} className="btn min-h-[44px] shrink-0 md:min-h-[36px]" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}{f.id === "saved" && counts.saved ? ` ${counts.saved}` : ""}
              </button>
            ))}
            <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden />
            <button className="btn min-h-[44px] shrink-0 md:min-h-[36px]" aria-pressed={highOnly} onClick={() => setHighOnly(!highOnly)}>HIGH only</button>
            <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden />
            <button className="btn min-h-[44px] shrink-0 md:min-h-[36px]" aria-pressed={view === "cards"} onClick={() => setView("cards")}>Cards</button>
            <button className="btn min-h-[44px] shrink-0 md:min-h-[36px]" aria-pressed={view === "timeline"} onClick={() => setView("timeline")}>Timeline</button>
          </div>

          <div className="sr-only" aria-live="polite">{feed.newHighIds.length > 0 ? `${feed.newHighIds.length} new high signal item${feed.newHighIds.length > 1 ? "s" : ""} on the wire` : ""}</div>

          {feed.failed && (
            <div className="panel mono mb-3 border-red/60 p-3 text-[12px] text-red" role="alert">
              /api/feed failed{feed.error ? ` (${feed.error})` : ""}.{feed.loadedOnce && feed.lastFetchAt && now ? ` Showing data from ${relAge(new Date(feed.lastFetchAt).toISOString(), now)}.` : ""} Retrying every 60s.
            </div>
          )}
          {problems.map((s) => (
            <div key={s.id} className="mono mb-2 flex flex-wrap items-center gap-2 rounded border border-line bg-panel px-3 py-2 text-[11.5px]" role="status">
              <span className="dot" style={{ background: s.status === "error" ? "var(--color-red)" : "var(--color-amber)" }} aria-hidden />
              <b>{s.label}</b>
              {s.status === "degraded"
                ? <span className="text-amber">unavailable — showing data from {s.lastSuccessAt && now ? relAge(s.lastSuccessAt, now).replace(" ago", "") : "earlier"} ago{s.lastError ? ` (${s.lastError})` : ""}</span>
                : <span className="text-red">unavailable{s.lastError ? ` — ${s.lastError}` : ""}</span>}
            </div>
          ))}

          {!feed.loadedOnce && !feed.failed ? (
            <div className="panel mono p-8 text-center text-[12px] text-muted" aria-busy="true">Loading the wire…</div>
          ) : visible.length === 0 ? (
            <div className="panel p-8 text-center">
              <p className="mono text-[13px]">{filter === "saved" ? "Nothing saved yet." : feed.items.length === 0 ? "The wire is empty." : "No items match these filters."}</p>
              <p className="mt-1 text-[12px] text-muted">
                {filter === "saved" ? "Use ☆ SAVE on any item — a snapshot is kept in this browser." : feed.items.length === 0 ? "No source returned items. Check Source Health — nothing is shown unless a source returned it." : "Clear the search or switch filters."}
              </p>
            </div>
          ) : view === "timeline" ? (
            <Timeline items={visible.slice(0, shown)} />
          ) : (
            <ul className="space-y-2.5">
              {visible.slice(0, shown).map((i) => (
                <li key={i.id}>
                  <ItemCard item={i} saved={savedIds.has(i.id)} onToggleSave={() => toggleSave(i)} isNew={lastSeenAt !== null && Date.parse(i.publishedAt) > lastSeenAt && i.signal === "high"} />
                </li>
              ))}
            </ul>
          )}
          {visible.length > shown && (
            <div className="mt-3 text-center">
              <button className="btn" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, visible.length - shown)} more · {visible.length - shown} remaining</button>
            </div>
          )}
        </div>

        <aside className="space-y-3" aria-label="Sidebar">
          <SourceHealthPanel sources={feed.sources} failed={feed.failed} error={feed.error} />
          <PositionPanel position={position} market={market} />
          <WatchWordsPanel words={words} setWords={setWords} onPick={(w) => { setQuery(w); searchRef.current?.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
          <XWatchPanel xWatch={feed.xWatch} connected={feed.xConnected} items={feed.items} status={feed.sources.find((s) => s.id === "x")} />
          <SignalKey />
        </aside>
      </div>
    </div>
  );
}
