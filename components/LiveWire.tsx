"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { WireItem } from "@/lib/types";
import type { Position } from "@/lib/config/position";
import { applyFilters, FILTERS, type FilterId } from "@/lib/filters";
import { DEFAULT_WATCH_WORDS } from "@/lib/config/watch";
import { usePersisted, useBaseline, writeStore } from "@/lib/client/usePersisted";
import { useNow } from "@/lib/client/useNow";
import { dayBucket, relAge } from "@/lib/time";
import { useFeed } from "./FeedProvider";
import ActivityChart from "./ActivityChart";
import NewsDrift from "./NewsDrift";
import Reader from "./Reader";
import ItemCard from "./ItemCard";
import Timeline from "./Timeline";
import RcAlert, { rcAlertItems } from "./RcAlert";
import { PositionPanel, SignalKey, SourceHealthPanel, WatchWordsPanel, XWatchPanel, type MarketView } from "./Sidebar";

const PAGE = 60;

function Tile({ label, value, sub, accent, onClick, pressed, hint }: { label: string; value: string; sub?: string; accent?: "red"; onClick?: () => void; pressed?: boolean; hint?: string }) {
  const body = (
    <>
      <div className="eyebrow">{label}</div>
      <div className={`display mt-3 text-[40px] tabular-nums md:text-[46px] ${accent === "red" ? "grad-text" : ""}`} suppressHydrationWarning>{value}</div>
      {sub && <div className="mono mt-2.5 truncate text-[10.5px] text-muted" title={sub}>{sub}</div>}
      {hint && <div className="mono absolute top-4 right-4 text-[10px] tracking-[0.1em] text-muted uppercase max-sm:hidden">{pressed ? "filter on ✓" : hint}</div>}
    </>
  );
  const cls = `panel relative overflow-hidden p-5 text-left ${accent === "red" ? "!border-red/30" : ""}`;
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={pressed} className={`${cls} cursor-pointer transition-colors hover:!border-line2`}>
      {accent === "red" && <span aria-hidden className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-red/20 blur-3xl" />}
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" aria-hidden>
    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
  </svg>
);

export default function LiveWire({ position, market }: { position: Position; market: MarketView }) {
  const feed = useFeed();
  const now = useNow();
  const [filter, setFilter] = usePersisted<FilterId>("gmelw:filter", "all");
  const [view, setView] = usePersisted<"cards" | "timeline">("gmelw:view", "cards");
  const [highOnly, setHighOnly] = usePersisted<boolean>("gmelw:highOnly", false);
  const [words, setWords] = usePersisted<string[]>("gmelw:words", DEFAULT_WATCH_WORDS);
  const [savedMap, setSavedMap] = usePersisted<Record<string, WireItem>>("gmelw:saved", {});
  const [readMap, setReadMap] = usePersisted<Record<string, number>>("gmelw:read", {});
  const [reader, setReader] = useState<{ list: WireItem[]; index: number } | null>(null);
  const [dismissed, setDismissed] = useState<string | undefined>();
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

  const readIds = useMemo(() => new Set(Object.keys(readMap)), [readMap]);
  const markRead = (id: string) =>
    setReadMap((m) => {
      if (m[id]) return m;
      const next = { ...m, [id]: Date.now() };
      const keys = Object.keys(next);
      if (keys.length > 400) for (const k of keys.sort((a, b) => next[a]! - next[b]!).slice(0, keys.length - 400)) delete next[k];
      return next;
    });
  const openReader = (list: WireItem[], index: number) => {
    setReader({ list, index });
    const it = list[index];
    if (it) markRead(it.id);
  };
  const navigateReader = (index: number) => {
    setReader((r) => (r ? { ...r, index } : r));
    const it = reader?.list[index];
    if (it) markRead(it.id);
  };
  const newIdSet = useMemo(() => new Set(feed.newIds), [feed.newIds]);
  const showToast = feed.newIds.length > 0 && dismissed !== feed.generatedAt && !reader;
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

  // group the visible slice by Brisbane day for the card view
  const groups = useMemo(() => {
    const out: { label: string; rows: WireItem[] }[] = [];
    for (const it of visible.slice(0, shown)) {
      const label = now ? dayBucket(it.publishedAt, now) : it.publishedAt.slice(0, 10);
      const g = out[out.length - 1];
      if (g && g.label === label) g.rows.push(it);
      else out.push({ label, rows: [it] });
    }
    return out;
  }, [visible, shown, now]);

  return (
    <div>
      <section className="mb-8 grid items-end gap-8 pt-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12 lg:pt-6">
        <div>
          <p className="eyebrow flex items-center gap-2.5">
            <span className="dot pulse !h-1.5 !w-1.5 bg-green" style={{ boxShadow: "0 0 10px var(--color-green)" }} aria-hidden />
            LIVE WIRE · refreshes every 60s
          </p>
          <h2 className="display mt-5 text-[44px] sm:text-[58px] lg:text-[68px]">
            Everything that can move <span className="grad-text">$GME</span>
          </h2>
          <p className="mt-5 max-w-[52ch] text-[15px] leading-relaxed text-muted">
            Primary sources first: SEC filings, company releases and credible reporting{feed.xConnected ? ", plus X" : ""}, each scored by how much it matters for understanding GameStop — <span className="text-ink2">not</span> a price signal. Every item links to its original source.
          </p>
        </div>
        <ActivityChart items={feed.items} now={now} />
      </section>

      <NewsDrift items={feed.items} now={now} readIds={readIds} onCatch={openReader} />

      <section className="mb-9 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4" aria-label="Wire summary">
        <Tile label="Wire items" value={feed.loadedOnce ? String(feed.items.length) : "—"} sub="deduplicated across sources" />
        <Tile label="High signal" value={feed.loadedOnce ? String(high) : "—"} sub="score ≥ 85" accent="red" onClick={() => setHighOnly(!highOnly)} pressed={highOnly} hint="tap to filter" />
        <Tile label="Latest SEC" value={latestSec ? `${(latestSec.form ?? "—").toUpperCase()} · ${now ? relAge(latestSec.publishedAt, now).replace(" ago", "") : "…"}` : "—"} sub={latestSec?.title} />
        <Tile label="Sources live" value={core.length ? `${live}/${core.length}` : "—"} sub={core.length ? core.map((s) => `${s.id.toUpperCase()} ${s.status}`).join(" · ") : undefined} />
      </section>

      <div className="grid gap-7 lg:grid-cols-[minmax(0,73fr)_minmax(0,27fr)] lg:gap-8">
        <div className="min-w-0">
          <RcAlert items={alerts} lastSeenAt={lastSeenAt} />

          <div className="glass sticky top-0 z-20 -mx-4 mb-4 border-b border-line px-4 py-2.5 md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
            <div className="relative">
              <label htmlFor="q" className="sr-only">Search the wire</label>
              <SearchIcon />
              <input id="q" ref={searchRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search eBay, warrant, Form 4…" autoComplete="off" className="field" />
              {query && <button className="btn absolute top-1/2 right-2 -translate-y-1/2" onClick={() => setQuery("")} aria-label="Clear search">Clear</button>}
            </div>
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2.5" role="toolbar" aria-label="Filters">
            <div className="scroll-x max-w-full">
              <div className="seg min-w-max">
                {FILTERS.map((f) => (
                  <button key={f.id} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                    {f.label}{f.id === "saved" && saved.length ? ` ${saved.length}` : ""}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn" aria-pressed={highOnly} onClick={() => setHighOnly(!highOnly)}>HIGH only</button>
            <div className="seg ml-auto">
              <button aria-pressed={view === "cards"} onClick={() => setView("cards")}>Cards</button>
              <button aria-pressed={view === "timeline"} onClick={() => setView("timeline")}>Timeline</button>
            </div>
          </div>

          <div className="sr-only" aria-live="polite">{feed.newHighIds.length > 0 ? `${feed.newHighIds.length} new high signal item${feed.newHighIds.length > 1 ? "s" : ""} on the wire` : ""}</div>

          {feed.failed && (
            <div className="panel mono mb-3 !border-red/40 p-3.5 text-[12px] text-red" role="alert">
              /api/feed failed{feed.error ? ` (${feed.error})` : ""}.{feed.loadedOnce && feed.lastFetchAt && now ? ` Showing data from ${relAge(new Date(feed.lastFetchAt).toISOString(), now)}.` : ""} Retrying every 60s.
            </div>
          )}
          {problems.map((s) => (
            <div key={s.id} className="mono mb-2 flex flex-wrap items-center gap-2.5 rounded-xl border border-line bg-white/[0.025] px-4 py-2.5 text-[11.5px]" role="status">
              <span className="dot" style={{ background: s.status === "error" ? "var(--color-red)" : "var(--color-amber)" }} aria-hidden />
              <b className="font-semibold text-ink">{s.label}</b>
              {s.status === "degraded"
                ? <span className="text-amber">unavailable — showing data from {s.lastSuccessAt && now ? relAge(s.lastSuccessAt, now).replace(" ago", "") : "earlier"} ago{s.lastError ? ` (${s.lastError})` : ""}</span>
                : <span className="text-red">unavailable{s.lastError ? ` — ${s.lastError}` : ""}</span>}
            </div>
          ))}

          {!feed.loadedOnce && !feed.failed ? (
            <div className="space-y-3" aria-busy="true" aria-label="Loading the wire">
              {[150, 128, 150, 128].map((h, i) => <div key={i} className="skeleton" style={{ height: h, animationDelay: `${i * 120}ms` }} />)}
            </div>
          ) : visible.length === 0 ? (
            <div className="panel px-6 py-14 text-center">
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full border border-line text-muted" aria-hidden>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l2-6 4 12 2-6h6" /></svg>
              </div>
              <p className="text-[16px] font-semibold">{filter === "saved" ? "Nothing saved yet" : feed.items.length === 0 ? "The wire is empty" : "No items match these filters"}</p>
              <p className="mx-auto mt-1.5 max-w-[48ch] text-[13px] leading-relaxed text-muted">
                {filter === "saved" ? "Use ☆ SAVE on any item — a snapshot is kept in this browser." : feed.items.length === 0 ? "No source returned items. Check Source Health — nothing is shown unless a source returned it." : "Clear the search or switch filters."}
              </p>
            </div>
          ) : view === "timeline" ? (
            <Timeline items={visible.slice(0, shown)} />
          ) : (
            <div className="space-y-2">
              {groups.map((g) => (
                <section key={g.label} aria-label={g.label}>
                  <h3 className="daybar">{g.label}<span className="tracking-normal text-muted normal-case">{g.rows.length}</span></h3>
                  <ul className="space-y-3">
                    {g.rows.map((i) => (
                      <li key={i.id}>
                        <ItemCard item={i} saved={savedIds.has(i.id)} onToggleSave={() => toggleSave(i)} isNew={lastSeenAt !== null && Date.parse(i.publishedAt) > lastSeenAt && i.signal === "high"} fresh={newIdSet.has(i.id)} read={readIds.has(i.id)} onRead={() => openReader(visible, visible.indexOf(i))} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
          {visible.length > shown && (
            <div className="mt-6 text-center">
              <button className="btn !px-6" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, visible.length - shown)} more · {visible.length - shown} remaining</button>
            </div>
          )}
        </div>

        <aside className="space-y-4" aria-label="Sidebar">
          <SourceHealthPanel sources={feed.sources} failed={feed.failed} error={feed.error} />
          <PositionPanel position={position} market={market} />
          <WatchWordsPanel words={words} setWords={setWords} onPick={(w) => { setQuery(w); searchRef.current?.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
          <XWatchPanel xWatch={feed.xWatch} connected={feed.xConnected} items={feed.items} status={feed.sources.find((s) => s.id === "x")} />
          <SignalKey />
        </aside>
      </div>
      {reader && reader.list[reader.index] && (
        <Reader
          list={reader.list}
          index={reader.index}
          saved={savedIds.has(reader.list[reader.index]!.id)}
          onToggleSave={() => toggleSave(reader.list[reader.index]!)}
          onNavigate={navigateReader}
          onClose={() => setReader(null)}
        />
      )}
      {showToast && (
        <button
          type="button"
          className="toast"
          onClick={() => { setDismissed(feed.generatedAt); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          aria-live="polite"
        >
          <span className="dot pulse !h-2 !w-2 bg-red" aria-hidden />
          {feed.newIds.length} new item{feed.newIds.length > 1 ? "s" : ""} on the wire{feed.newHighIds.length ? ` · ${feed.newHighIds.length} HIGH` : ""}
          <span className="text-muted">· jump to top</span>
        </button>
      )}
    </div>
  );
}
