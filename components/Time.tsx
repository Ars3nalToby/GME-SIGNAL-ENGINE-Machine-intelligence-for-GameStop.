"use client";
import { fmtBrisbane, fmtDateOnly, fmtHm, fmtNY, relAge } from "@/lib/time";
import { BRISBANE_ZONE } from "@/lib/config/watch";
import { useNow } from "@/lib/client/useNow";

/** Time rail for a card: Brisbane clock time + relative age (after mount) + date. Date-only sources show just the date. */
export function Stamp({ iso, dateOnly }: { iso: string; dateOnly?: boolean }) {
  const now = useNow();
  const title = dateOnly ? "The source gave a date only (no time of day)" : `${fmtNY(iso)} (New York) · ${fmtBrisbane(iso, true)}`;
  if (dateOnly) {
    return (
      <time dateTime={iso} title={title} className="rail mono" suppressHydrationWarning>
        <span className="text-[14px] font-semibold text-ink">{fmtDateOnly(iso).replace(" (date only)", "")}</span>
        <span className="text-[10.5px] text-muted">date only</span>
      </time>
    );
  }
  return (
    <time dateTime={iso} title={title} className="rail mono" suppressHydrationWarning>
      <span className="text-[15px] font-semibold tracking-[0.02em] text-ink">{fmtHm(iso, BRISBANE_ZONE)}</span>
      <span className="text-[10.5px] text-muted">{now ? relAge(iso, now) : ""}</span>
      <span className="text-[10.5px] text-muted max-md:hidden">{fmtBrisbane(iso).slice(0, 6)} AEST</span>
    </time>
  );
}

export function RelOnly({ iso }: { iso: string }) {
  const now = useNow();
  return (
    <time dateTime={iso} title={`${fmtBrisbane(iso, true)} · ${fmtNY(iso)}`} suppressHydrationWarning>
      {now ? relAge(iso, now) : fmtBrisbane(iso)}
    </time>
  );
}
