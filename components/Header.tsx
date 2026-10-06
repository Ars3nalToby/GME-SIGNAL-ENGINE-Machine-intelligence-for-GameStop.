"use client";
import { fmtClock, nyseSession } from "@/lib/time";
import { BRISBANE_ZONE, NY_ZONE } from "@/lib/config/watch";
import { overallStatus } from "@/lib/health-view";
import { useNow } from "@/lib/client/useNow";
import { useFeed, POLL_MS } from "./FeedProvider";
import Nav from "./Nav";

export default function Header() {
  const now = useNow();
  const feed = useFeed();
  const status = overallStatus(feed.sources, feed.failed);
  const pill = status === "live" ? { c: "var(--color-green)", t: "LIVE WIRE", d: "all core sources live" } : status === "degraded" ? { c: "var(--color-amber)", t: "LIVE WIRE", d: "one or more sources degraded or not set up" } : { c: "var(--color-red)", t: "FEED ERROR", d: "/api/feed failed" };
  const session = now ? nyseSession(now) : null;
  const next = feed.lastFetchAt && now ? Math.max(0, Math.round((feed.lastFetchAt + POLL_MS - now) / 1000)) : null;
  const updated = feed.lastFetchAt ? fmtClock(feed.lastFetchAt, BRISBANE_ZONE) : null;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <div className="mr-auto min-w-0">
          <div className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-5 w-1.5 bg-red" />
            <h1 className="mono text-[15px] font-semibold tracking-[0.18em]">GME LIVE WIRE</h1>
          </div>
          <p className="mono text-[10.5px] tracking-[0.16em] text-muted uppercase">GameStop Intelligence Terminal</p>
        </div>

        <div className="mono flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-muted" aria-label="Clocks">
          <span suppressHydrationWarning>BNE <b className="text-ink font-medium">{now ? fmtClock(now, BRISBANE_ZONE) : "--:--:--"}</b></span>
          <span suppressHydrationWarning>NYC <b className="text-ink font-medium">{now ? fmtClock(now, NY_ZONE) : "--:--:--"}</b></span>
          <span title={session ? `NYSE ${session.detail}. Holidays only as listed in config${session.calendarKnown ? "" : " — the configured calendar has ended: holidays are NOT known for this date"}. Early closes are not modelled.` : undefined}>
            NYSE <b className="text-ink font-medium">{session ? session.label : "—"}{session && !session.calendarKnown ? "*" : ""}</b>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="mono inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.12em]" style={{ borderColor: pill.c, color: pill.c }} title={pill.d}>
            <span className={`dot ${feed.loading ? "" : "pulse"}`} style={{ background: pill.c }} aria-hidden />
            {pill.t}
          </span>
          <span className="mono text-[11px] text-muted" aria-live="off">
            {updated ? <>Updated {updated}{next !== null ? ` · next ${next}s` : ""}</> : feed.failed ? "Update failed" : "Loading…"}
          </span>
          <button className="btn" onClick={feed.refresh} aria-label="Refresh feed" disabled={feed.loading} title="Re-fetches /api/feed (server caches still apply)">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" className={feed.loading ? "spin" : ""} aria-hidden>
              <path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" />
            </svg>
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>
      <Nav />
    </header>
  );
}
