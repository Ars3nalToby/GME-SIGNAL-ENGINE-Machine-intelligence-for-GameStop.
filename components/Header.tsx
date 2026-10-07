"use client";
import { fmtClock, nyseSession } from "@/lib/time";
import { BRISBANE_ZONE, NY_ZONE } from "@/lib/config/watch";
import { overallStatus } from "@/lib/health-view";
import { useNow } from "@/lib/client/useNow";
import { useFeed, POLL_MS } from "./FeedProvider";
import Logo from "./Logo";
import Nav from "./Nav";

export default function Header() {
  const now = useNow();
  const feed = useFeed();
  const status = overallStatus(feed.sources, feed.failed);
  const pill =
    status === "live"
      ? { c: "var(--color-green)", t: "LIVE WIRE", d: "all core sources live" }
      : status === "degraded"
        ? { c: "var(--color-amber)", t: "LIVE WIRE", d: "one or more sources degraded or not set up" }
        : { c: "var(--color-red)", t: "FEED ERROR", d: "/api/feed failed" };
  const session = now ? nyseSession(now) : null;
  const next = feed.lastFetchAt && now ? Math.max(0, Math.round((feed.lastFetchAt + POLL_MS - now) / 1000)) : null;
  const updated = feed.lastFetchAt ? fmtClock(feed.lastFetchAt, BRISBANE_ZONE) : null;
  const sessionColor = session?.label === "Open" ? "var(--color-green)" : session?.label === "Closed" ? "var(--color-muted)" : "var(--color-amber)";

  return (
    <header className="glass sticky top-0 z-40 border-b border-line md:sticky max-md:static">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 md:flex-nowrap md:gap-x-5 md:px-6">
        <div className="flex items-center gap-2.5 md:gap-3">
          <Logo />
          <div className="leading-none">
            <h1 className="text-[14px] font-bold tracking-[0.08em] md:text-[15px] md:tracking-[0.1em]">GME LIVE WIRE</h1>
            <p className="mono mt-1.5 hidden text-[9.5px] tracking-[0.2em] text-muted uppercase sm:block">GameStop Intelligence Terminal</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 md:order-last md:gap-2.5">
          <span
            className="mono inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold tracking-[0.1em] md:px-3.5 md:text-[11px] md:tracking-[0.14em]"
            style={{ borderColor: `color-mix(in srgb, ${pill.c} 45%, transparent)`, color: pill.c, background: `color-mix(in srgb, ${pill.c} 9%, transparent)` }}
            title={pill.d}
          >
            <span className={`dot ${feed.loading ? "" : "pulse"}`} style={{ background: pill.c, boxShadow: `0 0 10px ${pill.c}` }} aria-hidden />
            {pill.t}
          </span>
          <button className="btn !h-9 !w-9 !justify-center !p-0 max-md:!h-11 max-md:!w-11" onClick={feed.refresh} aria-label="Refresh feed" disabled={feed.loading} title="Re-fetches /api/feed (server caches still apply)">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={feed.loading ? "spin" : ""} aria-hidden>
              <path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" />
            </svg>
          </button>
        </div>

        <Nav />
      </div>

      <div className="border-t border-line/70">
        <div className="mono mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 text-[11px] text-muted md:px-6" aria-label="Clocks and refresh status">
          <span suppressHydrationWarning>BNE <b className="font-medium text-ink">{now ? fmtClock(now, BRISBANE_ZONE) : "--:--:--"}</b></span>
          <span suppressHydrationWarning>NYC <b className="font-medium text-ink">{now ? fmtClock(now, NY_ZONE) : "--:--:--"}</b></span>
          <span
            className="inline-flex items-center gap-1.5"
            title={session ? `NYSE ${session.detail}. Holidays only as listed in config${session.calendarKnown ? "" : " — the configured calendar has ended: holidays are NOT known for this date"}. Early closes are not modelled.` : undefined}
          >
            <span className="dot !h-1.5 !w-1.5" style={{ background: sessionColor }} aria-hidden />
            NYSE <b className="font-medium text-ink">{session ? session.label : "—"}{session && !session.calendarKnown ? "*" : ""}</b>
          </span>
          <span className="ml-auto" aria-live="off">
            {updated ? <>Updated <b className="font-medium text-ink">{updated}</b>{next !== null ? ` · next ${next}s` : ""}</> : feed.failed ? "Update failed" : "Loading…"}
          </span>
        </div>
      </div>
    </header>
  );
}
