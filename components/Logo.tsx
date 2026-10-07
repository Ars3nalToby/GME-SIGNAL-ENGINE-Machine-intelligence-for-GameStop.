/** GME LIVE WIRE mark: a signal pulse on a dark tile with a red wire. Pure SVG, no assets. */
export default function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="GME Live Wire" className="shrink-0">
      <defs>
        <linearGradient id="lw-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1a2030" />
          <stop offset="1" stopColor="#0a0d14" />
        </linearGradient>
        <linearGradient id="lw-red" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff4b5c" />
          <stop offset="1" stopColor="#c81428" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="39" height="39" rx="10" fill="url(#lw-bg)" stroke="rgba(255,255,255,0.14)" />
      <rect x="7" y="9" width="4" height="22" rx="2" fill="url(#lw-red)" />
      <path d="M15 24 L19.5 24 L22 14 L26 29 L28.5 21 L33 21" fill="none" stroke="#f4f6fb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
