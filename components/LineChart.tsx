import { safeHref } from "@/lib/url";

export type Pt = { t: number; v: number; title: string; href?: string };
export type Series = { id: string; label: string; color: string; points: Pt[] };

const W = 1100;
const H = 260;
const M = { l: 64, r: 16, t: 14, b: 30 };

const fmtDate = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Hand-rolled SVG line chart (server-rendered, no JS). Every point is a link + <title> tooltip naming its source filing. */
export default function LineChart({ series, fmtY, ariaLabel }: { series: Series[]; fmtY: (v: number) => string; ariaLabel: string }) {
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return <p className="mono p-6 text-center text-[12px] text-muted">No data points to plot.</p>;
  let t0 = Math.min(...all.map((p) => p.t));
  let t1 = Math.max(...all.map((p) => p.t));
  if (t0 === t1) {
    t0 -= 15 * 86400_000;
    t1 += 15 * 86400_000;
  }
  let v0 = Math.min(...all.map((p) => p.v));
  let v1 = Math.max(...all.map((p) => p.v));
  if (v0 === v1) {
    // a single value: show it against a zero baseline so the axis labels are distinct
    v0 = 0;
    v1 = v1 * 2 || 1;
  } else {
    const pad = (v1 - v0) * 0.12;
    v0 = Math.max(0, v0 - pad);
    v1 += pad;
  }
  const x = (t: number) => M.l + ((t - t0) / (t1 - t0)) * (W - M.l - M.r);
  const y = (v: number) => H - M.b - ((v - v0) / (v1 - v0)) * (H - M.t - M.b);
  const ticks = [0, 1, 2, 3, 4].map((i) => v0 + ((v1 - v0) * i) / 4);
  return (
    <figure>
      <div className="scroll-x"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="mx-auto w-full min-w-[680px] max-w-[1100px]" preserveAspectRatio="xMidYMid meet">
        {ticks.map((tv) => (
          <g key={tv}>
            <line x1={M.l} x2={W - M.r} y1={y(tv)} y2={y(tv)} stroke="#252b39" strokeWidth="1" />
            <text x={M.l - 8} y={y(tv) + 4} textAnchor="end" fontSize="10.5" fill="#8992a6" fontFamily="var(--font-mono)">{fmtY(tv)}</text>
          </g>
        ))}
        <text x={M.l} y={H - 8} fontSize="10.5" fill="#8992a6" fontFamily="var(--font-mono)">{fmtDate(t0)}</text>
        <text x={W - M.r} y={H - 8} textAnchor="end" fontSize="10.5" fill="#8992a6" fontFamily="var(--font-mono)">{fmtDate(t1)}</text>
        {series.map((s) => {
          const pts = [...s.points].sort((a, b) => a.t - b.t);
          return (
            <g key={s.id}>
              {pts.length > 1 && <polyline fill="none" stroke={s.color} strokeWidth="1.8" points={pts.map((p) => `${x(p.t)},${y(p.v)}`).join(" ")} />}
              {pts.map((p, i) => {
                const href = safeHref(p.href);
                const dot = (
                  <circle cx={x(p.t)} cy={y(p.v)} r="4.5" fill="#0f1219" stroke={s.color} strokeWidth="2">
                    <title>{p.title}</title>
                  </circle>
                );
                return href ? (
                  <a key={i} href={href} target="_blank" rel="noopener noreferrer">{dot}</a>
                ) : (
                  <g key={i}>{dot}</g>
                );
              })}
            </g>
          );
        })}
      </svg></div>
      <figcaption className="mono mt-1 flex flex-wrap gap-4 text-[11px] text-muted">
        {series.map((s) => <span key={s.id}><span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: s.color }} aria-hidden />{s.label}</span>)}
        <span>Hover or tap a point for its source filing.</span>
      </figcaption>
    </figure>
  );
}
