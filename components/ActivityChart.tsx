"use client";
import { useMemo, useState } from "react";
import type { WireItem } from "@/lib/types";
import { BRISBANE_ZONE } from "@/lib/config/watch";
import { DateTime } from "luxon";

const HOURS = 48;
const W = 576;
const H = 112;
const PAD = { l: 4, r: 4, t: 8, b: 2 };
const HOUR = 3_600_000;

// one accent (HIGH) against a recessive neutral: the "emphasis" form
const C_HIGH = "#ff4b5c";
const C_OTHER = "#56627f";

/** top-rounded bar path (square at the baseline) */
function bar(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

/** Items per hour over the last 48 h, from the wire itself (counts only — no scraped numbers). */
export default function ActivityChart({ items, now }: { items: WireItem[]; now: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const data = useMemo(() => {
    const b = Array.from({ length: HOURS }, () => ({ high: 0, other: 0 }));
    if (!now) return b;
    for (const i of items) {
      const age = now - Date.parse(i.publishedAt);
      if (age < 0 || age >= HOURS * HOUR) continue;
      const idx = HOURS - 1 - Math.floor(age / HOUR);
      if (i.signal === "high") b[idx]!.high++;
      else b[idx]!.other++;
    }
    return b;
  }, [items, now]);

  const total = data.reduce((a, d) => a + d.high + d.other, 0);
  const highs = data.reduce((a, d) => a + d.high, 0);
  const max = Math.max(1, ...data.map((d) => d.high + d.other));
  const slot = (W - PAD.l - PAD.r) / HOURS;
  const bw = Math.min(24, slot * 0.62);
  const plotH = H - PAD.t - PAD.b;
  const scale = plotH / max;

  const label = (idx: number) => {
    const end = now - (HOURS - 1 - idx) * HOUR;
    const start = DateTime.fromMillis(end - HOUR, { zone: BRISBANE_ZONE, locale: "en-AU" });
    return `${start.toFormat("ccc dd LLL HH:00")}–${start.plus({ hours: 1 }).toFormat("HH:00")} AEST`;
  };

  return (
    <div className="panel p-4 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="panel-title">Wire activity · last 48h</h2>
        <div className="mono flex items-center gap-4 text-[10.5px] text-muted">
          <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-[2px]" style={{ background: C_HIGH }} />HIGH signal</span>
          <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-[2px]" style={{ background: C_OTHER }} />Other items</span>
        </div>
      </div>
      <div className="relative mt-3">
        {!now ? (
          <div className="skeleton h-[132px]" aria-hidden />
        ) : total === 0 ? (
          <p className="mono grid h-[132px] place-items-center text-[12px] text-muted">No items in the last 48 hours.</p>
        ) : (
          <>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Items per hour over the last 48 hours: ${total} items, ${highs} high signal`} onMouseLeave={() => setHover(null)}>
              <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="rgba(255,255,255,0.14)" />
              {[0.5, 1].map((f) => (
                <line key={f} x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b - plotH * f} y2={H - PAD.b - plotH * f} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" />
              ))}
              {data.map((d, i) => {
                const x = PAD.l + i * slot + (slot - bw) / 2;
                const hOther = d.other * scale;
                const hHigh = d.high * scale;
                const gap = d.other && d.high ? 2 : 0;
                const yBase = H - PAD.b;
                return (
                  <g key={i} opacity={hover === null || hover === i ? 1 : 0.45}>
                    {d.other > 0 && <path d={bar(x, yBase - hOther, bw, hOther, d.high ? 0.01 : 3)} fill={C_OTHER} />}
                    {d.high > 0 && <path d={bar(x, yBase - hOther - gap - hHigh, bw, hHigh, 3)} fill={C_HIGH} />}
                    <rect x={PAD.l + i * slot} y={0} width={slot} height={H - PAD.b} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
                  </g>
                );
              })}
            </svg>
            <div className="mono mt-1 flex justify-between text-[10.5px] text-muted"><span>−48h</span><span>−24h</span><span>now</span></div>
            {hover !== null && (
              <div
                className="mono pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line2 bg-panel2 px-3 py-2 text-[11px] shadow-xl"
                style={{ left: `${Math.min(88, Math.max(12, ((PAD.l + (hover + 0.5) * slot) / W) * 100))}%` }}
                role="status"
              >
                <div className="text-muted">{label(hover)}</div>
                <div className="mt-0.5 text-ink">{data[hover]!.high + data[hover]!.other} item{data[hover]!.high + data[hover]!.other === 1 ? "" : "s"} · <span style={{ color: C_HIGH }}>{data[hover]!.high} HIGH</span></div>
              </div>
            )}
          </>
        )}
      </div>
      <p className="mono mt-2 text-[10.5px] text-muted">peak {max}/h · {total} item{total === 1 ? "" : "s"} in 48h · {highs} HIGH · counts of wire items by publish time, not price activity.</p>
      <table className="sr-only">
        <caption>Wire items per hour, last 48 hours</caption>
        <thead><tr><th>Hour</th><th>High</th><th>Other</th></tr></thead>
        <tbody>{now ? data.map((d, i) => <tr key={i}><td>{label(i)}</td><td>{d.high}</td><td>{d.other}</td></tr>) : null}</tbody>
      </table>
    </div>
  );
}
