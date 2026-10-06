"use client";
import { fmtBrisbane, fmtNY, relAge } from "@/lib/time";
import { useNow } from "@/lib/client/useNow";

/** Server/first paint: absolute Brisbane time. After mount: relative age + absolute. */
export function Age({ iso, className }: { iso: string; className?: string }) {
  const now = useNow();
  return (
    <time dateTime={iso} title={`${fmtNY(iso)} (New York)`} className={className} suppressHydrationWarning>
      {now ? `${relAge(iso, now)} · ` : ""}
      {fmtBrisbane(iso)}
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
