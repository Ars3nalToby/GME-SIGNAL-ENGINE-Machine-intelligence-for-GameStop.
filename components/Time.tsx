"use client";
import { fmtBrisbane, fmtDateOnly, fmtNY, relAge } from "@/lib/time";
import { useNow } from "@/lib/client/useNow";

/** Server/first paint: absolute Brisbane time. After mount: relative age + absolute. */
export function Age({ iso, className, dateOnly }: { iso: string; className?: string; dateOnly?: boolean }) {
  const now = useNow();
  return (
    <time dateTime={iso} title={dateOnly ? "The source gave a date only (no time of day)" : `${fmtNY(iso)} (New York)`} className={className} suppressHydrationWarning>
      {dateOnly ? fmtDateOnly(iso) : <>{now ? `${relAge(iso, now)} · ` : ""}{fmtBrisbane(iso)}</>}
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
